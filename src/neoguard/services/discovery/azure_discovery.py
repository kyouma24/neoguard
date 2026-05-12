"""Azure resource discovery — auto-discovers resources across Azure services."""

import asyncio

from azure.mgmt.compute import ComputeManagementClient
from azure.mgmt.containerservice import ContainerServiceClient
from azure.mgmt.cosmosdb import CosmosDBManagementClient
from azure.mgmt.dns import DnsManagementClient
from azure.mgmt.keyvault import KeyVaultManagementClient
from azure.mgmt.network import NetworkManagementClient
from azure.mgmt.redis import RedisManagementClient
from azure.mgmt.sql import SqlManagementClient
from azure.mgmt.storage import StorageManagementClient
from azure.mgmt.web import WebSiteManagementClient

from neoguard.core.logging import log
from neoguard.models.azure import AzureSubscription
from neoguard.models.resources import (
    Provider,
    ResourceCreate,
    ResourceStatus,
    ResourceType,
)
from neoguard.services.azure.credentials import get_mgmt_client
from neoguard.services.resources.crud import upsert_resource


async def discover_all(sub: AzureSubscription, region: str, tenant_id: str) -> dict:
    """Run all Azure discovery functions for a subscription+region. Returns counts."""
    results: dict[str, int] = {}
    for name, func in _DISCOVERERS.items():
        try:
            count = await func(sub, region, tenant_id)
            results[name] = count
        except Exception as e:
            await log.aerror(
                "Azure discovery failed", service=name, region=region, error=str(e),
            )
            results[name] = -1
    return results


def _azure_tags(tags: dict | None) -> dict[str, str]:
    if not tags:
        return {}
    return {k: str(v) for k, v in tags.items() if v is not None}


def _status_from_provisioning(state: str | None) -> ResourceStatus:
    if not state:
        return ResourceStatus.UNKNOWN
    s = state.lower()
    if s == "succeeded":
        return ResourceStatus.ACTIVE
    if s in ("deleting", "deleted"):
        return ResourceStatus.TERMINATED
    if s == "failed":
        return ResourceStatus.UNKNOWN
    return ResourceStatus.ACTIVE


def _status_from_power_state(statuses: list | None) -> ResourceStatus:
    if not statuses:
        return ResourceStatus.UNKNOWN
    for s in statuses:
        code = getattr(s, "code", "")
        if code == "PowerState/running":
            return ResourceStatus.ACTIVE
        if code in ("PowerState/stopped", "PowerState/deallocated"):
            return ResourceStatus.STOPPED
    return ResourceStatus.UNKNOWN


async def _discover_vms(sub: AzureSubscription, region: str, tenant_id: str) -> int:
    client = get_mgmt_client(sub, ComputeManagementClient)
    count = 0
    all_vms = await asyncio.to_thread(lambda: list(client.virtual_machines.list_all()))
    for vm in all_vms:
        if vm.location.lower().replace(" ", "") != region:
            continue
        tags = _azure_tags(vm.tags)
        hw = vm.hardware_profile
        os_profile = vm.os_profile
        net_interfaces = vm.network_profile.network_interfaces if vm.network_profile else []

        status = ResourceStatus.UNKNOWN
        try:
            instance_view = await asyncio.to_thread(
                client.virtual_machines.instance_view,
                _resource_group_from_id(vm.id), vm.name,
            )
            status = _status_from_power_state(instance_view.statuses)
        except Exception:
            pass

        await upsert_resource(tenant_id, ResourceCreate(
            resource_type=ResourceType.AZURE_VM,
            provider=Provider.AZURE,
            region=region,
            account_id=sub.subscription_id,
            name=vm.name,
            external_id=vm.id,
            tags=tags,
            metadata={
                "vm_size": hw.vm_size if hw else "",
                "os_type": "linux" if (os_profile and os_profile.linux_configuration)
                    else "windows" if (os_profile and os_profile.windows_configuration)
                    else "unknown",
                "os_offer": vm.storage_profile.image_reference.offer
                    if vm.storage_profile and vm.storage_profile.image_reference else "",
                "os_sku": vm.storage_profile.image_reference.sku
                    if vm.storage_profile and vm.storage_profile.image_reference else "",
                "resource_group": _resource_group_from_id(vm.id),
                "availability_zone": vm.zones[0] if vm.zones else "",
                "nic_count": len(net_interfaces),
                "os_disk_size_gb": vm.storage_profile.os_disk.disk_size_gb
                    if vm.storage_profile and vm.storage_profile.os_disk else 0,
                "data_disk_count": len(vm.storage_profile.data_disks)
                    if vm.storage_profile and vm.storage_profile.data_disks else 0,
                "provisioning_state": vm.provisioning_state or "",
            },
            status=status,
        ))
        count += 1
    await log.ainfo("Azure VM discovery complete", region=region, count=count)
    return count


async def _discover_disks(sub: AzureSubscription, region: str, tenant_id: str) -> int:
    client = get_mgmt_client(sub, ComputeManagementClient)
    count = 0
    all_disks = await asyncio.to_thread(lambda: list(client.disks.list()))
    for disk in all_disks:
        if disk.location.lower().replace(" ", "") != region:
            continue
        tags = _azure_tags(disk.tags)
        await upsert_resource(tenant_id, ResourceCreate(
            resource_type=ResourceType.AZURE_DISK,
            provider=Provider.AZURE,
            region=region,
            account_id=sub.subscription_id,
            name=disk.name,
            external_id=disk.id,
            tags=tags,
            metadata={
                "disk_size_gb": disk.disk_size_gb or 0,
                "sku": disk.sku.name if disk.sku else "",
                "tier": disk.sku.tier if disk.sku else "",
                "disk_state": disk.disk_state or "",
                "os_type": str(disk.os_type) if disk.os_type else "",
                "resource_group": _resource_group_from_id(disk.id),
                "managed_by": disk.managed_by or "",
                "encryption_type": disk.encryption.type if disk.encryption else "",
                "iops_read_write": disk.disk_iops_read_write or 0,
                "mbps_read_write": disk.disk_m_bps_read_write or 0,
                "creation_source": str(disk.creation_data.create_option)
                    if disk.creation_data else "",
                "zones": disk.zones[0] if disk.zones else "",
            },
            status=_status_from_provisioning(disk.provisioning_state),
        ))
        count += 1
    await log.ainfo("Azure Disk discovery complete", region=region, count=count)
    return count


async def _discover_sql_databases(
    sub: AzureSubscription, region: str, tenant_id: str,
) -> int:
    client = get_mgmt_client(sub, SqlManagementClient)
    count = 0
    all_servers = await asyncio.to_thread(lambda: list(client.servers.list()))
    for server in all_servers:
        if server.location.lower().replace(" ", "") != region:
            continue
        rg = _resource_group_from_id(server.id)
        all_dbs = await asyncio.to_thread(
            lambda rg=rg, sn=server.name: list(client.databases.list_by_server(rg, sn)),
        )
        for db in all_dbs:
            if db.name == "master":
                continue
            tags = _azure_tags(db.tags)
            await upsert_resource(tenant_id, ResourceCreate(
                resource_type=ResourceType.AZURE_SQL,
                provider=Provider.AZURE,
                region=region,
                account_id=sub.subscription_id,
                name=f"{server.name}/{db.name}",
                external_id=db.id,
                tags=tags,
                metadata={
                    "server_name": server.name,
                    "database_name": db.name,
                    "sku_name": db.sku.name if db.sku else "",
                    "sku_tier": db.sku.tier if db.sku else "",
                    "sku_capacity": db.sku.capacity if db.sku else 0,
                    "max_size_bytes": db.max_size_bytes or 0,
                    "collation": db.collation or "",
                    "status": db.status or "",
                    "resource_group": _resource_group_from_id(server.id),
                    "server_fqdn": server.fully_qualified_domain_name or "",
                    "zone_redundant": db.zone_redundant or False,
                    "elastic_pool_id": db.elastic_pool_id or "",
                },
                status=_status_from_provisioning(db.status),
            ))
            count += 1
    await log.ainfo("Azure SQL discovery complete", region=region, count=count)
    return count


async def _discover_functions(
    sub: AzureSubscription, region: str, tenant_id: str,
) -> int:
    client = get_mgmt_client(sub, WebSiteManagementClient)
    count = 0
    all_apps = await asyncio.to_thread(lambda: list(client.web_apps.list()))
    for app in all_apps:
        if app.location.lower().replace(" ", "") != region:
            continue
        if app.kind and "functionapp" not in app.kind.lower():
            continue
        tags = _azure_tags(app.tags)
        await upsert_resource(tenant_id, ResourceCreate(
            resource_type=ResourceType.AZURE_FUNCTION,
            provider=Provider.AZURE,
            region=region,
            account_id=sub.subscription_id,
            name=app.name,
            external_id=app.id,
            tags=tags,
            metadata={
                "kind": app.kind or "",
                "state": app.state or "",
                "default_hostname": app.default_host_name or "",
                "resource_group": _resource_group_from_id(app.id),
                "runtime_stack": app.site_config.linux_fx_version or ""
                    if app.site_config else "",
                "https_only": app.https_only or False,
                "always_on": app.site_config.always_on or False
                    if app.site_config else False,
                "app_service_plan_id": app.server_farm_id or "",
            },
            status=ResourceStatus.ACTIVE if app.state == "Running" else ResourceStatus.STOPPED,
        ))
        count += 1
    await log.ainfo("Azure Functions discovery complete", region=region, count=count)
    return count


async def _discover_app_services(
    sub: AzureSubscription, region: str, tenant_id: str,
) -> int:
    client = get_mgmt_client(sub, WebSiteManagementClient)
    count = 0
    all_apps = await asyncio.to_thread(lambda: list(client.web_apps.list()))
    for app in all_apps:
        if app.location.lower().replace(" ", "") != region:
            continue
        if app.kind and "functionapp" in app.kind.lower():
            continue
        tags = _azure_tags(app.tags)
        await upsert_resource(tenant_id, ResourceCreate(
            resource_type=ResourceType.AZURE_APP_SERVICE,
            provider=Provider.AZURE,
            region=region,
            account_id=sub.subscription_id,
            name=app.name,
            external_id=app.id,
            tags=tags,
            metadata={
                "kind": app.kind or "",
                "state": app.state or "",
                "default_hostname": app.default_host_name or "",
                "resource_group": _resource_group_from_id(app.id),
                "https_only": app.https_only or False,
                "app_service_plan_id": app.server_farm_id or "",
                "outbound_ips": app.outbound_ip_addresses or "",
            },
            status=ResourceStatus.ACTIVE if app.state == "Running" else ResourceStatus.STOPPED,
        ))
        count += 1
    await log.ainfo("Azure App Service discovery complete", region=region, count=count)
    return count


async def _discover_aks(sub: AzureSubscription, region: str, tenant_id: str) -> int:
    client = get_mgmt_client(sub, ContainerServiceClient)
    count = 0
    all_clusters = await asyncio.to_thread(lambda: list(client.managed_clusters.list()))
    for cluster in all_clusters:
        if cluster.location.lower().replace(" ", "") != region:
            continue
        tags = _azure_tags(cluster.tags)
        pools = cluster.agent_pool_profiles or []
        total_nodes = sum(p.count or 0 for p in pools)
        await upsert_resource(tenant_id, ResourceCreate(
            resource_type=ResourceType.AZURE_AKS,
            provider=Provider.AZURE,
            region=region,
            account_id=sub.subscription_id,
            name=cluster.name,
            external_id=cluster.id,
            tags=tags,
            metadata={
                "kubernetes_version": cluster.kubernetes_version or "",
                "resource_group": _resource_group_from_id(cluster.id),
                "node_resource_group": cluster.node_resource_group or "",
                "fqdn": cluster.fqdn or "",
                "power_state": cluster.power_state.code
                    if cluster.power_state else "",
                "provisioning_state": cluster.provisioning_state or "",
                "network_plugin": cluster.network_profile.network_plugin
                    if cluster.network_profile else "",
                "node_pool_count": len(pools),
                "total_node_count": total_nodes,
                "sku_tier": cluster.sku.tier if cluster.sku else "",
            },
            status=_status_from_provisioning(cluster.provisioning_state),
        ))
        count += 1
    await log.ainfo("Azure AKS discovery complete", region=region, count=count)
    return count


async def _discover_storage(sub: AzureSubscription, region: str, tenant_id: str) -> int:
    client = get_mgmt_client(sub, StorageManagementClient)
    count = 0
    all_accounts = await asyncio.to_thread(lambda: list(client.storage_accounts.list()))
    for acct in all_accounts:
        if acct.location.lower().replace(" ", "") != region:
            continue
        tags = _azure_tags(acct.tags)
        await upsert_resource(tenant_id, ResourceCreate(
            resource_type=ResourceType.AZURE_STORAGE,
            provider=Provider.AZURE,
            region=region,
            account_id=sub.subscription_id,
            name=acct.name,
            external_id=acct.id,
            tags=tags,
            metadata={
                "kind": str(acct.kind) if acct.kind else "",
                "sku_name": acct.sku.name if acct.sku else "",
                "sku_tier": acct.sku.tier if acct.sku else "",
                "resource_group": _resource_group_from_id(acct.id),
                "access_tier": str(acct.access_tier) if acct.access_tier else "",
                "https_traffic_only": acct.enable_https_traffic_only or False,
                "blob_endpoint": acct.primary_endpoints.blob
                    if acct.primary_endpoints else "",
                "provisioning_state": str(acct.provisioning_state)
                    if acct.provisioning_state else "",
                "encryption_key_source": acct.encryption.key_source
                    if acct.encryption else "",
                "is_hns_enabled": acct.is_hns_enabled or False,
            },
            status=_status_from_provisioning(
                str(acct.provisioning_state) if acct.provisioning_state else None
            ),
        ))
        count += 1
    await log.ainfo("Azure Storage discovery complete", region=region, count=count)
    return count


async def _discover_load_balancers(
    sub: AzureSubscription, region: str, tenant_id: str,
) -> int:
    client = get_mgmt_client(sub, NetworkManagementClient)
    count = 0
    all_lbs = await asyncio.to_thread(lambda: list(client.load_balancers.list_all()))
    for lb in all_lbs:
        if lb.location.lower().replace(" ", "") != region:
            continue
        tags = _azure_tags(lb.tags)
        frontend_ips = lb.frontend_ip_configurations or []
        backend_pools = lb.backend_address_pools or []
        await upsert_resource(tenant_id, ResourceCreate(
            resource_type=ResourceType.AZURE_LB,
            provider=Provider.AZURE,
            region=region,
            account_id=sub.subscription_id,
            name=lb.name,
            external_id=lb.id,
            tags=tags,
            metadata={
                "sku": lb.sku.name if lb.sku else "",
                "sku_tier": lb.sku.tier if lb.sku else "",
                "resource_group": _resource_group_from_id(lb.id),
                "frontend_ip_count": len(frontend_ips),
                "backend_pool_count": len(backend_pools),
                "rule_count": len(lb.load_balancing_rules or []),
                "probe_count": len(lb.probes or []),
                "provisioning_state": lb.provisioning_state or "",
            },
            status=_status_from_provisioning(lb.provisioning_state),
        ))
        count += 1
    await log.ainfo("Azure LB discovery complete", region=region, count=count)
    return count


async def _discover_app_gateways(
    sub: AzureSubscription, region: str, tenant_id: str,
) -> int:
    client = get_mgmt_client(sub, NetworkManagementClient)
    count = 0
    all_gws = await asyncio.to_thread(lambda: list(client.application_gateways.list_all()))
    for gw in all_gws:
        if gw.location.lower().replace(" ", "") != region:
            continue
        tags = _azure_tags(gw.tags)
        await upsert_resource(tenant_id, ResourceCreate(
            resource_type=ResourceType.AZURE_APP_GW,
            provider=Provider.AZURE,
            region=region,
            account_id=sub.subscription_id,
            name=gw.name,
            external_id=gw.id,
            tags=tags,
            metadata={
                "sku_name": gw.sku.name if gw.sku else "",
                "sku_tier": gw.sku.tier if gw.sku else "",
                "sku_capacity": gw.sku.capacity if gw.sku else 0,
                "resource_group": _resource_group_from_id(gw.id),
                "operational_state": gw.operational_state or "",
                "provisioning_state": gw.provisioning_state or "",
                "http_listener_count": len(gw.http_listeners or []),
                "backend_pool_count": len(gw.backend_address_pools or []),
                "waf_enabled": gw.web_application_firewall_configuration is not None,
            },
            status=_status_from_provisioning(gw.provisioning_state),
        ))
        count += 1
    await log.ainfo("Azure App Gateway discovery complete", region=region, count=count)
    return count


async def _discover_cosmosdb(
    sub: AzureSubscription, region: str, tenant_id: str,
) -> int:
    client = get_mgmt_client(sub, CosmosDBManagementClient)
    count = 0
    all_accounts = await asyncio.to_thread(lambda: list(client.database_accounts.list()))
    for acct in all_accounts:
        if acct.location and acct.location.lower().replace(" ", "") != region:
            continue
        tags = _azure_tags(acct.tags)
        locations = acct.read_locations or []
        await upsert_resource(tenant_id, ResourceCreate(
            resource_type=ResourceType.AZURE_COSMOSDB,
            provider=Provider.AZURE,
            region=region,
            account_id=sub.subscription_id,
            name=acct.name,
            external_id=acct.id,
            tags=tags,
            metadata={
                "kind": str(acct.kind) if acct.kind else "",
                "resource_group": _resource_group_from_id(acct.id),
                "document_endpoint": acct.document_endpoint or "",
                "database_account_offer_type": acct.database_account_offer_type or "",
                "consistency_level": str(acct.consistency_policy.default_consistency_level)
                    if acct.consistency_policy else "",
                "read_locations": len(locations),
                "enable_automatic_failover": acct.enable_automatic_failover or False,
                "provisioning_state": acct.provisioning_state or "",
                "capabilities": [c.name for c in (acct.capabilities or []) if c.name],
            },
            status=_status_from_provisioning(acct.provisioning_state),
        ))
        count += 1
    await log.ainfo("Azure CosmosDB discovery complete", region=region, count=count)
    return count


async def _discover_redis(sub: AzureSubscription, region: str, tenant_id: str) -> int:
    client = get_mgmt_client(sub, RedisManagementClient)
    count = 0
    all_caches = await asyncio.to_thread(lambda: list(client.redis.list_by_subscription()))
    for cache in all_caches:
        if cache.location.lower().replace(" ", "") != region:
            continue
        tags = _azure_tags(cache.tags)
        await upsert_resource(tenant_id, ResourceCreate(
            resource_type=ResourceType.AZURE_REDIS,
            provider=Provider.AZURE,
            region=region,
            account_id=sub.subscription_id,
            name=cache.name,
            external_id=cache.id,
            tags=tags,
            metadata={
                "sku_name": cache.sku.name if cache.sku else "",
                "sku_family": cache.sku.family if cache.sku else "",
                "sku_capacity": cache.sku.capacity if cache.sku else 0,
                "resource_group": _resource_group_from_id(cache.id),
                "hostname": cache.host_name or "",
                "port": cache.port or 0,
                "ssl_port": cache.ssl_port or 0,
                "redis_version": cache.redis_version or "",
                "provisioning_state": cache.provisioning_state or "",
                "non_ssl_port_enabled": cache.enable_non_ssl_port or False,
                "shard_count": cache.shard_count or 0,
            },
            status=_status_from_provisioning(cache.provisioning_state),
        ))
        count += 1
    await log.ainfo("Azure Redis discovery complete", region=region, count=count)
    return count


async def _discover_vnets(sub: AzureSubscription, region: str, tenant_id: str) -> int:
    client = get_mgmt_client(sub, NetworkManagementClient)
    count = 0
    all_vnets = await asyncio.to_thread(lambda: list(client.virtual_networks.list_all()))
    for vnet in all_vnets:
        if vnet.location.lower().replace(" ", "") != region:
            continue
        tags = _azure_tags(vnet.tags)
        subnets = vnet.subnets or []
        address_space = vnet.address_space.address_prefixes if vnet.address_space else []
        await upsert_resource(tenant_id, ResourceCreate(
            resource_type=ResourceType.AZURE_VNET,
            provider=Provider.AZURE,
            region=region,
            account_id=sub.subscription_id,
            name=vnet.name,
            external_id=vnet.id,
            tags=tags,
            metadata={
                "resource_group": _resource_group_from_id(vnet.id),
                "address_prefixes": address_space,
                "subnet_count": len(subnets),
                "provisioning_state": vnet.provisioning_state or "",
                "enable_ddos_protection": vnet.enable_ddos_protection or False,
            },
            status=_status_from_provisioning(vnet.provisioning_state),
        ))
        count += 1
    await log.ainfo("Azure VNet discovery complete", region=region, count=count)
    return count


async def _discover_nsgs(sub: AzureSubscription, region: str, tenant_id: str) -> int:
    client = get_mgmt_client(sub, NetworkManagementClient)
    count = 0
    all_nsgs = await asyncio.to_thread(lambda: list(client.network_security_groups.list_all()))
    for nsg in all_nsgs:
        if nsg.location.lower().replace(" ", "") != region:
            continue
        tags = _azure_tags(nsg.tags)
        rules = nsg.security_rules or []
        await upsert_resource(tenant_id, ResourceCreate(
            resource_type=ResourceType.AZURE_NSG,
            provider=Provider.AZURE,
            region=region,
            account_id=sub.subscription_id,
            name=nsg.name,
            external_id=nsg.id,
            tags=tags,
            metadata={
                "resource_group": _resource_group_from_id(nsg.id),
                "rule_count": len(rules),
                "subnet_associations": len(nsg.subnets or []),
                "nic_associations": len(nsg.network_interfaces or []),
                "provisioning_state": nsg.provisioning_state or "",
            },
            status=_status_from_provisioning(nsg.provisioning_state),
        ))
        count += 1
    await log.ainfo("Azure NSG discovery complete", region=region, count=count)
    return count


async def _discover_dns_zones(
    sub: AzureSubscription, region: str, tenant_id: str,
) -> int:
    client = get_mgmt_client(sub, DnsManagementClient)
    count = 0
    all_zones = await asyncio.to_thread(lambda: list(client.zones.list()))
    for zone in all_zones:
        if zone.location and zone.location.lower() not in ("global", region):
            continue
        tags = _azure_tags(zone.tags)
        await upsert_resource(tenant_id, ResourceCreate(
            resource_type=ResourceType.AZURE_DNS_ZONE,
            provider=Provider.AZURE,
            region="global",
            account_id=sub.subscription_id,
            name=zone.name,
            external_id=zone.id,
            tags=tags,
            metadata={
                "zone_type": str(zone.zone_type) if zone.zone_type else "",
                "number_of_record_sets": zone.number_of_record_sets or 0,
                "max_number_of_record_sets": zone.max_number_of_record_sets or 0,
                "name_servers": list(zone.name_servers or []),
                "resource_group": _resource_group_from_id(zone.id),
            },
            status=ResourceStatus.ACTIVE,
        ))
        count += 1
    await log.ainfo("Azure DNS Zone discovery complete", region=region, count=count)
    return count


async def _discover_key_vaults(
    sub: AzureSubscription, region: str, tenant_id: str,
) -> int:
    client = get_mgmt_client(sub, KeyVaultManagementClient)
    count = 0
    all_vaults = await asyncio.to_thread(lambda: list(client.vaults.list_by_subscription()))
    for vault in all_vaults:
        if vault.location.lower().replace(" ", "") != region:
            continue
        tags = _azure_tags(vault.tags)
        props = vault.properties
        await upsert_resource(tenant_id, ResourceCreate(
            resource_type=ResourceType.AZURE_KEY_VAULT,
            provider=Provider.AZURE,
            region=region,
            account_id=sub.subscription_id,
            name=vault.name,
            external_id=vault.id,
            tags=tags,
            metadata={
                "resource_group": _resource_group_from_id(vault.id),
                "vault_uri": props.vault_uri if props else "",
                "sku": props.sku.name if props and props.sku else "",
                "soft_delete_enabled": props.enable_soft_delete if props else False,
                "purge_protection_enabled": props.enable_purge_protection if props else False,
                "provisioning_state": props.provisioning_state if props else "",
            },
            status=ResourceStatus.ACTIVE,
        ))
        count += 1
    await log.ainfo("Azure Key Vault discovery complete", region=region, count=count)
    return count


def _resource_group_from_id(resource_id: str) -> str:
    """Extract resource group name from an Azure resource ID."""
    parts = resource_id.split("/")
    try:
        idx = [p.lower() for p in parts].index("resourcegroups")
        return parts[idx + 1]
    except (ValueError, IndexError):
        return ""


_DISCOVERERS: dict[str, object] = {
    "azure_vm": _discover_vms,
    "azure_disk": _discover_disks,
    "azure_sql": _discover_sql_databases,
    "azure_function": _discover_functions,
    "azure_app_service": _discover_app_services,
    "azure_aks": _discover_aks,
    "azure_storage": _discover_storage,
    "azure_lb": _discover_load_balancers,
    "azure_app_gw": _discover_app_gateways,
    "azure_cosmosdb": _discover_cosmosdb,
    "azure_redis": _discover_redis,
    "azure_vnet": _discover_vnets,
    "azure_nsg": _discover_nsgs,
    "azure_dns_zone": _discover_dns_zones,
    "azure_key_vault": _discover_key_vaults,
}
