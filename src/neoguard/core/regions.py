"""Default region sets for cloud providers.

Prioritises regions where Indian and global enterprise workloads commonly run.
Used as defaults when creating new cloud accounts — users can override per account.
"""

AWS_DEFAULT_REGIONS: list[str] = [
    # India
    "ap-south-1",       # Mumbai
    # Asia-Pacific (frequently paired with India workloads)
    "ap-southeast-1",   # Singapore
    "ap-southeast-2",   # Sydney
    "ap-northeast-1",   # Tokyo
    # US — the two most common
    "us-east-1",        # N. Virginia (global default)
    "us-east-2",        # Ohio
    "us-west-2",        # Oregon
    # Europe — the two most common
    "eu-west-1",        # Ireland
    "eu-central-1",     # Frankfurt
]

AZURE_DEFAULT_REGIONS: list[str] = [
    # India
    "centralindia",     # Pune
    "southindia",       # Chennai
    "westindia",        # Mumbai
    # Asia-Pacific
    "southeastasia",    # Singapore
    "eastasia",         # Hong Kong
    "japaneast",        # Tokyo
    "australiaeast",    # Sydney
    # US
    "eastus",           # Virginia
    "eastus2",          # Virginia
    "westus2",          # Washington
    "centralus",        # Iowa
    # Europe
    "westeurope",       # Netherlands
    "northeurope",      # Ireland
    "uksouth",          # London
]

GCP_DEFAULT_REGIONS: list[str] = [
    # India
    "asia-south1",      # Mumbai
    "asia-south2",      # Delhi
    # Asia-Pacific
    "asia-southeast1",  # Singapore
    "asia-southeast2",  # Jakarta
    "asia-northeast1",  # Tokyo
    "australia-southeast1",  # Sydney
    # US
    "us-east1",         # South Carolina
    "us-east4",         # N. Virginia
    "us-central1",      # Iowa
    "us-west1",         # Oregon
    # Europe
    "europe-west1",     # Belgium
    "europe-west2",     # London
    "europe-west3",     # Frankfurt
]
