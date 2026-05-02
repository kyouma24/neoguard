"""Auto-generate a starter dashboard on first successful discovery."""

from neoguard.core.logging import log
from neoguard.models.dashboards import DashboardCreate, PanelDefinition, PanelType
from neoguard.services.dashboards import create_dashboard, list_dashboards


AWS_PANELS = [
    PanelDefinition(
        id="aws-cpu", title="EC2 CPU Utilization", panel_type=PanelType.TIMESERIES,
        metric_name="aws.ec2.CPUUtilization", aggregation="avg",
        width=6, height=4, position_x=0, position_y=0,
    ),
    PanelDefinition(
        id="aws-net-in", title="EC2 Network In", panel_type=PanelType.AREA,
        metric_name="aws.ec2.NetworkIn", aggregation="avg",
        width=6, height=4, position_x=6, position_y=0,
    ),
    PanelDefinition(
        id="aws-disk-read", title="EBS Read Ops", panel_type=PanelType.TIMESERIES,
        metric_name="aws.ebs.VolumeReadOps", aggregation="sum",
        width=6, height=4, position_x=0, position_y=4,
    ),
    PanelDefinition(
        id="aws-disk-write", title="EBS Write Ops", panel_type=PanelType.TIMESERIES,
        metric_name="aws.ebs.VolumeWriteOps", aggregation="sum",
        width=6, height=4, position_x=6, position_y=4,
    ),
    PanelDefinition(
        id="aws-lambda-inv", title="Lambda Invocations", panel_type=PanelType.TIMESERIES,
        metric_name="aws.lambda.Invocations", aggregation="sum",
        width=6, height=4, position_x=0, position_y=8,
    ),
    PanelDefinition(
        id="aws-rds-cpu", title="RDS CPU Utilization", panel_type=PanelType.TIMESERIES,
        metric_name="aws.rds.CPUUtilization", aggregation="avg",
        width=6, height=4, position_x=6, position_y=8,
    ),
]

AZURE_PANELS = [
    PanelDefinition(
        id="az-vm-cpu", title="VM CPU Percentage", panel_type=PanelType.TIMESERIES,
        metric_name="azure.vm.Percentage CPU", aggregation="avg",
        width=6, height=4, position_x=0, position_y=0,
    ),
    PanelDefinition(
        id="az-vm-net-in", title="VM Network In", panel_type=PanelType.AREA,
        metric_name="azure.vm.Network In Total", aggregation="avg",
        width=6, height=4, position_x=6, position_y=0,
    ),
    PanelDefinition(
        id="az-sql-cpu", title="SQL DB CPU Percent", panel_type=PanelType.TIMESERIES,
        metric_name="azure.sql_database.cpu_percent", aggregation="avg",
        width=6, height=4, position_x=0, position_y=4,
    ),
    PanelDefinition(
        id="az-func-exec", title="Function Executions", panel_type=PanelType.TIMESERIES,
        metric_name="azure.function_app.FunctionExecutionCount", aggregation="sum",
        width=6, height=4, position_x=6, position_y=4,
    ),
]


async def maybe_create_starter_dashboard(
    tenant_id: str,
    provider: str,
) -> bool:
    existing = await list_dashboards(tenant_id, limit=1)
    if existing:
        return False

    if provider == "aws":
        panels = AWS_PANELS
        name = "AWS Overview"
        desc = "Auto-generated dashboard with key AWS infrastructure metrics."
    elif provider == "azure":
        panels = AZURE_PANELS
        name = "Azure Overview"
        desc = "Auto-generated dashboard with key Azure infrastructure metrics."
    else:
        return False

    data = DashboardCreate(name=name, description=desc, panels=panels)
    await create_dashboard(tenant_id, data)
    await log.ainfo(
        "starter_dashboard.created",
        tenant_id=tenant_id,
        provider=provider,
        dashboard_name=name,
    )
    return True
