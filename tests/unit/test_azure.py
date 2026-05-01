"""Unit tests for Azure models, discovery structure, and monitor metric definitions."""

from datetime import datetime
from types import SimpleNamespace

from neoguard.core.regions import AZURE_DEFAULT_REGIONS
from neoguard.models.azure import AzureSubscription, AzureSubscriptionCreate
from neoguard.models.resources import Provider, ResourceType
from neoguard.services.azure.monitor import AGG_MAP, METRIC_DEFINITIONS
from neoguard.services.discovery.azure_discovery import (
    _DISCOVERERS,
    _azure_tags,
    _resource_group_from_id,
    _status_from_power_state,
    _status_from_provisioning,
)


class TestAzureModel:
    def test_create_model_defaults(self):
        data = AzureSubscriptionCreate(
            name="Test Sub",
            subscription_id="00000000-0000-0000-0000-000000000001",
            tenant_id="00000000-0000-0000-0000-000000000002",
            client_id="app-id",
            client_secret="secret",  # noqa: S106
        )
        assert data.name == "Test Sub"
        assert len(data.regions) == len(AZURE_DEFAULT_REGIONS)
        assert "centralindia" in data.regions
        assert "eastus" in data.regions

    def test_subscription_model(self):
        sub = AzureSubscription(
            id="sub-001",
            tenant_id="default",
            name="Prod",
            subscription_id="00000000-0000-0000-0000-000000000001",
            azure_tenant_id="00000000-0000-0000-0000-000000000002",
            client_id="app-id",
            regions=["centralindia", "eastus"],
            enabled=True,
            collect_config={},
            last_sync_at=None,
            created_at=datetime(2026, 1, 1),
            updated_at=datetime(2026, 1, 1),
        )
        assert sub.subscription_id == "00000000-0000-0000-0000-000000000001"
        assert sub.azure_tenant_id == "00000000-0000-0000-0000-000000000002"

    def test_subscription_id_format(self):
        import pytest
        with pytest.raises(ValueError):
            AzureSubscriptionCreate(
                name="Bad",
                subscription_id="not-a-uuid",
                tenant_id="00000000-0000-0000-0000-000000000002",
                client_id="app-id",
                client_secret="secret",  # noqa: S106
            )


class TestAzureDefaultRegions:
    def test_count(self):
        assert len(AZURE_DEFAULT_REGIONS) == 14

    def test_india_first(self):
        assert AZURE_DEFAULT_REGIONS[0] == "centralindia"
        assert "southindia" in AZURE_DEFAULT_REGIONS
        assert "westindia" in AZURE_DEFAULT_REGIONS

    def test_global_coverage(self):
        assert "eastus" in AZURE_DEFAULT_REGIONS
        assert "westeurope" in AZURE_DEFAULT_REGIONS
        assert "southeastasia" in AZURE_DEFAULT_REGIONS


class TestAzureResourceTypes:
    def test_azure_vm_enum(self):
        assert ResourceType.AZURE_VM == "azure_vm"

    def test_azure_disk_enum(self):
        assert ResourceType.AZURE_DISK == "azure_disk"

    def test_azure_sql_enum(self):
        assert ResourceType.AZURE_SQL == "azure_sql"

    def test_azure_function_enum(self):
        assert ResourceType.AZURE_FUNCTION == "azure_function"

    def test_azure_aks_enum(self):
        assert ResourceType.AZURE_AKS == "azure_aks"

    def test_azure_storage_enum(self):
        assert ResourceType.AZURE_STORAGE == "azure_storage"

    def test_azure_cosmosdb_enum(self):
        assert ResourceType.AZURE_COSMOSDB == "azure_cosmosdb"

    def test_azure_redis_enum(self):
        assert ResourceType.AZURE_REDIS == "azure_redis"

    def test_azure_lb_enum(self):
        assert ResourceType.AZURE_LB == "azure_lb"

    def test_azure_app_gw_enum(self):
        assert ResourceType.AZURE_APP_GW == "azure_app_gw"

    def test_azure_vnet_enum(self):
        assert ResourceType.AZURE_VNET == "azure_vnet"

    def test_azure_nsg_enum(self):
        assert ResourceType.AZURE_NSG == "azure_nsg"

    def test_azure_dns_zone_enum(self):
        assert ResourceType.AZURE_DNS_ZONE == "azure_dns_zone"

    def test_azure_key_vault_enum(self):
        assert ResourceType.AZURE_KEY_VAULT == "azure_key_vault"

    def test_azure_app_service_enum(self):
        assert ResourceType.AZURE_APP_SERVICE == "azure_app_service"

    def test_provider_azure(self):
        assert Provider.AZURE == "azure"


class TestAzureDiscoveryHelpers:
    def test_azure_tags_none(self):
        assert _azure_tags(None) == {}

    def test_azure_tags_empty(self):
        assert _azure_tags({}) == {}

    def test_azure_tags_converts(self):
        tags = _azure_tags({"env": "prod", "team": "infra", "count": 5})
        assert tags["env"] == "prod"
        assert tags["count"] == "5"

    def test_azure_tags_skips_none_values(self):
        tags = _azure_tags({"env": "prod", "empty": None})
        assert "empty" not in tags
        assert tags["env"] == "prod"

    def test_resource_group_from_id(self):
        rid = (
            "/subscriptions/abc/resourceGroups/myRG"
            "/providers/Microsoft.Compute/virtualMachines/vm1"
        )
        assert _resource_group_from_id(rid) == "myRG"

    def test_resource_group_from_id_case_insensitive(self):
        rid = "/subscriptions/abc/resourcegroups/TestRG/providers/X/Y/z"
        assert _resource_group_from_id(rid) == "TestRG"

    def test_resource_group_from_invalid_id(self):
        assert _resource_group_from_id("not-an-azure-id") == ""
        assert _resource_group_from_id("") == ""

    def test_status_from_provisioning_succeeded(self):
        from neoguard.models.resources import ResourceStatus
        assert _status_from_provisioning("Succeeded") == ResourceStatus.ACTIVE

    def test_status_from_provisioning_deleting(self):
        from neoguard.models.resources import ResourceStatus
        assert _status_from_provisioning("Deleting") == ResourceStatus.TERMINATED

    def test_status_from_provisioning_failed(self):
        from neoguard.models.resources import ResourceStatus
        assert _status_from_provisioning("Failed") == ResourceStatus.UNKNOWN

    def test_status_from_provisioning_none(self):
        from neoguard.models.resources import ResourceStatus
        assert _status_from_provisioning(None) == ResourceStatus.UNKNOWN

    def test_power_state_running(self):
        from neoguard.models.resources import ResourceStatus
        statuses = [SimpleNamespace(code="PowerState/running")]
        assert _status_from_power_state(statuses) == ResourceStatus.ACTIVE

    def test_power_state_stopped(self):
        from neoguard.models.resources import ResourceStatus
        statuses = [SimpleNamespace(code="PowerState/stopped")]
        assert _status_from_power_state(statuses) == ResourceStatus.STOPPED

    def test_power_state_deallocated(self):
        from neoguard.models.resources import ResourceStatus
        statuses = [SimpleNamespace(code="PowerState/deallocated")]
        assert _status_from_power_state(statuses) == ResourceStatus.STOPPED

    def test_power_state_none(self):
        from neoguard.models.resources import ResourceStatus
        assert _status_from_power_state(None) == ResourceStatus.UNKNOWN

    def test_power_state_empty(self):
        from neoguard.models.resources import ResourceStatus
        assert _status_from_power_state([]) == ResourceStatus.UNKNOWN


class TestAzureDiscoverers:
    def test_discoverer_count(self):
        assert len(_DISCOVERERS) == 15

    def test_all_discoverers_exist(self):
        expected = {
            "azure_vm", "azure_disk", "azure_sql", "azure_function",
            "azure_app_service", "azure_aks", "azure_storage", "azure_lb",
            "azure_app_gw", "azure_cosmosdb", "azure_redis", "azure_vnet",
            "azure_nsg", "azure_dns_zone", "azure_key_vault",
        }
        assert set(_DISCOVERERS.keys()) == expected

    def test_all_discoverers_are_callable(self):
        for name, func in _DISCOVERERS.items():
            assert callable(func), f"Discoverer {name} is not callable"


class TestAzureMonitorMetrics:
    def test_metric_definitions_count(self):
        assert len(METRIC_DEFINITIONS) == 10

    def test_vm_metrics_count(self):
        assert len(METRIC_DEFINITIONS["azure_vm"]) == 10

    def test_sql_metrics_count(self):
        assert len(METRIC_DEFINITIONS["azure_sql"]) == 10

    def test_redis_metrics_count(self):
        assert len(METRIC_DEFINITIONS["azure_redis"]) == 12

    def test_all_metric_defs_have_required_keys(self):
        for rtype, metrics in METRIC_DEFINITIONS.items():
            for m in metrics:
                assert "name" in m, f"Missing 'name' in {rtype}"
                assert "agg" in m, f"Missing 'agg' in {rtype}"
                assert "alias" in m, f"Missing 'alias' in {rtype}"
                assert "unit" in m, f"Missing 'unit' in {rtype}"

    def test_all_agg_types_in_map(self):
        for rtype, metrics in METRIC_DEFINITIONS.items():
            for m in metrics:
                assert m["agg"] in AGG_MAP, (
                    f"Unknown agg '{m['agg']}' in {rtype}.{m['name']}"
                )

    def test_vm_has_cpu_metric(self):
        names = [m["alias"] for m in METRIC_DEFINITIONS["azure_vm"]]
        assert "cpu_percent" in names

    def test_sql_has_dtu_metric(self):
        names = [m["alias"] for m in METRIC_DEFINITIONS["azure_sql"]]
        assert "dtu_pct" in names

    def test_storage_has_availability(self):
        names = [m["alias"] for m in METRIC_DEFINITIONS["azure_storage"]]
        assert "availability" in names

    def test_aks_has_node_cpu(self):
        names = [m["alias"] for m in METRIC_DEFINITIONS["azure_aks"]]
        assert "node_cpu_pct" in names

    def test_cosmosdb_has_ru(self):
        names = [m["alias"] for m in METRIC_DEFINITIONS["azure_cosmosdb"]]
        assert "total_ru" in names

    def test_no_duplicate_aliases_per_type(self):
        for rtype, metrics in METRIC_DEFINITIONS.items():
            aliases = [m["alias"] for m in metrics]
            assert len(aliases) == len(set(aliases)), (
                f"Duplicate alias in {rtype}"
            )

    def test_metric_types_cover_discoverers(self):
        discoverer_types = set(_DISCOVERERS.keys())
        metric_types = set(METRIC_DEFINITIONS.keys())
        no_metrics = {"azure_vnet", "azure_nsg", "azure_dns_zone",
                      "azure_key_vault", "azure_app_gw"}
        for dt in discoverer_types - no_metrics:
            assert dt in metric_types, (
                f"Discoverer {dt} has no metric definitions"
            )
