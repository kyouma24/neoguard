"""Unit tests for onboarding cloud account verification and discovery preview.

All AWS (boto3) and Azure SDK calls are fully mocked — no credentials needed.
"""

from unittest.mock import MagicMock, patch, call

import pytest
from botocore.exceptions import ClientError

from neoguard.services.onboarding.verify import (
    AWS_SERVICE_PROBES,
    verify_aws_role,
    discover_aws_preview,
    verify_azure_sp,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _client_error(code: str, message: str = "test error") -> ClientError:
    """Build a botocore ClientError with the given code and message."""
    return ClientError(
        {"Error": {"Code": code, "Message": message}},
        "TestOperation",
    )


def _sts_assume_role_response(
    account_id: str = "123456789012",
) -> dict:
    """Build a minimal successful STS AssumeRole response."""
    return {
        "Credentials": {
            "AccessKeyId": "AKIAIOSFODNN7EXAMPLE",
            "SecretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            "SessionToken": "FwoGZXIvYXdzEBYaDH...",
        },
        "AssumedRoleUser": {
            "Arn": f"arn:aws:sts::{account_id}:assumed-role/NeoGuardRole/neoguard-onboarding-verify",
            "AssumedRoleId": "AROA3XFRBF23EXAMPLE:neoguard-onboarding-verify",
        },
    }


# ===========================================================================
# verify_aws_role
# ===========================================================================

class TestVerifyAWSRoleSuccess:
    """Happy-path: STS succeeds, service probes succeed."""

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_returns_success_true(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.return_value = _sts_assume_role_response()

        mock_session = MagicMock()
        mock_boto3.Session.return_value = mock_session
        mock_service_client = MagicMock()
        mock_session.client.return_value = mock_service_client

        result = verify_aws_role(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc123",
        )

        assert result["success"] is True
        assert result["error"] is None

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_extracts_account_id_from_arn(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.return_value = _sts_assume_role_response("999888777666")

        mock_session = MagicMock()
        mock_boto3.Session.return_value = mock_session
        mock_session.client.return_value = MagicMock()

        result = verify_aws_role(
            "arn:aws:iam::999888777666:role/NeoGuardRole",
            "ng-abc123",
        )

        assert result["account_id"] == "999888777666"

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_probes_all_seven_services(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.return_value = _sts_assume_role_response()

        mock_session = MagicMock()
        mock_boto3.Session.return_value = mock_session
        mock_service_client = MagicMock()
        mock_session.client.return_value = mock_service_client

        result = verify_aws_role(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc123",
        )

        assert len(result["services"]) == len(AWS_SERVICE_PROBES)
        for svc_key in AWS_SERVICE_PROBES:
            assert svc_key in result["services"]
            assert result["services"][svc_key]["ok"] is True
            assert result["services"][svc_key]["error"] is None

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_service_labels_match_probe_config(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.return_value = _sts_assume_role_response()

        mock_session = MagicMock()
        mock_boto3.Session.return_value = mock_session
        mock_session.client.return_value = MagicMock()

        result = verify_aws_role(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc123",
        )

        for svc_key, probe in AWS_SERVICE_PROBES.items():
            assert result["services"][svc_key]["label"] == probe["label"]

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_external_id_passed_to_sts(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.return_value = _sts_assume_role_response()

        mock_session = MagicMock()
        mock_boto3.Session.return_value = mock_session
        mock_session.client.return_value = MagicMock()

        verify_aws_role(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-test-external-id",
            region="eu-west-1",
        )

        call_kwargs = mock_sts.assume_role.call_args[1]
        assert call_kwargs["ExternalId"] == "ng-test-external-id"
        assert call_kwargs["RoleArn"] == "arn:aws:iam::123456789012:role/NeoGuardRole"
        assert call_kwargs["DurationSeconds"] == 900

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_empty_external_id_omitted_from_params(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.return_value = _sts_assume_role_response()

        mock_session = MagicMock()
        mock_boto3.Session.return_value = mock_session
        mock_session.client.return_value = MagicMock()

        verify_aws_role(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "",
        )

        call_kwargs = mock_sts.assume_role.call_args[1]
        assert "ExternalId" not in call_kwargs

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_session_uses_assumed_credentials(self, mock_boto3):
        creds = _sts_assume_role_response()["Credentials"]
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.return_value = _sts_assume_role_response()

        mock_session = MagicMock()
        mock_boto3.Session.return_value = mock_session
        mock_session.client.return_value = MagicMock()

        verify_aws_role(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
            region="us-west-2",
        )

        mock_boto3.Session.assert_called_once_with(
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds["SessionToken"],
            region_name="us-west-2",
        )


class TestVerifyAWSRoleSTSErrors:
    """STS AssumeRole failures return early with descriptive errors."""

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_access_denied_includes_external_id_hint(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.side_effect = _client_error("AccessDenied", "Not authorized")

        result = verify_aws_role(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-my-ext-id",
        )

        assert result["success"] is False
        assert result["account_id"] is None
        assert "Cannot assume the role" in result["error"]
        assert "ng-my-ext-id" in result["error"]
        assert result["services"] == {}

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_malformed_policy_returns_specific_message(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.side_effect = _client_error(
            "MalformedPolicyDocument", "Invalid policy"
        )

        result = verify_aws_role(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
        )

        assert result["success"] is False
        assert "trust policy is malformed" in result["error"]
        assert "IAM" in result["error"]

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_unknown_client_error_returns_code_and_message(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.side_effect = _client_error(
            "RegionDisabledException", "Region is disabled"
        )

        result = verify_aws_role(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
        )

        assert result["success"] is False
        assert "RegionDisabledException" in result["error"]
        assert "Region is disabled" in result["error"]

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_unexpected_exception_returns_error_string(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.side_effect = RuntimeError("Network unreachable")

        result = verify_aws_role(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
        )

        assert result["success"] is False
        assert "Unexpected error" in result["error"]
        assert "Network unreachable" in result["error"]


class TestVerifyAWSRoleServiceProbes:
    """Service probe failures after successful STS assumption."""

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_access_denied_returns_missing_permission(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.return_value = _sts_assume_role_response()

        mock_session = MagicMock()
        mock_boto3.Session.return_value = mock_session

        # Every service client raises AccessDeniedException
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client
        for probe in AWS_SERVICE_PROBES.values():
            getattr(mock_client, probe["method"]).side_effect = _client_error(
                "AccessDeniedException", "User is not authorized"
            )

        result = verify_aws_role(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
        )

        assert result["success"] is True  # STS succeeded
        for svc_key, svc in result["services"].items():
            assert svc["ok"] is False
            assert "Missing permission" in svc["error"]

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_unauthorized_access_returns_missing_permission(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.return_value = _sts_assume_role_response()

        mock_session = MagicMock()
        mock_boto3.Session.return_value = mock_session
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client

        # Use UnauthorizedAccess code variant
        for probe in AWS_SERVICE_PROBES.values():
            getattr(mock_client, probe["method"]).side_effect = _client_error(
                "UnauthorizedAccess", "Unauthorized"
            )

        result = verify_aws_role(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
        )

        for svc_key, svc in result["services"].items():
            assert svc["ok"] is False
            assert "Missing permission" in svc["error"]

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_non_access_client_error_returns_code(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.return_value = _sts_assume_role_response()

        mock_session = MagicMock()
        mock_boto3.Session.return_value = mock_session
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client

        # Raise a non-access error on ec2 probe
        for probe in AWS_SERVICE_PROBES.values():
            getattr(mock_client, probe["method"]).side_effect = _client_error(
                "Throttling", "Rate exceeded"
            )

        result = verify_aws_role(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
        )

        for svc_key, svc in result["services"].items():
            assert svc["ok"] is False
            assert svc["error"] == "Throttling"

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_unexpected_probe_error_truncated_to_200(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.return_value = _sts_assume_role_response()

        mock_session = MagicMock()
        mock_boto3.Session.return_value = mock_session
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client

        long_msg = "x" * 500
        for probe in AWS_SERVICE_PROBES.values():
            getattr(mock_client, probe["method"]).side_effect = RuntimeError(long_msg)

        result = verify_aws_role(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
        )

        for svc_key, svc in result["services"].items():
            assert svc["ok"] is False
            assert len(svc["error"]) <= 200

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_mixed_probe_results(self, mock_boto3):
        """Some probes succeed, some fail."""
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.return_value = _sts_assume_role_response()

        mock_session = MagicMock()
        mock_boto3.Session.return_value = mock_session

        # Return a client that succeeds for some methods, fails for others
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client

        # Make ec2 probe fail, everything else succeed
        mock_client.describe_instances.side_effect = _client_error(
            "AccessDeniedException", "No EC2 access"
        )

        result = verify_aws_role(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
        )

        assert result["success"] is True
        assert result["services"]["ec2"]["ok"] is False
        assert "Missing permission" in result["services"]["ec2"]["error"]
        # Other services should be ok (MagicMock returns successfully)
        for svc_key in AWS_SERVICE_PROBES:
            if svc_key != "ec2":
                assert result["services"][svc_key]["ok"] is True

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_account_id_none_when_arn_too_short(self, mock_boto3):
        """If AssumedRoleUser ARN has fewer than 5 colon-separated parts."""
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts

        resp = _sts_assume_role_response()
        resp["AssumedRoleUser"]["Arn"] = "malformed-arn"
        mock_sts.assume_role.return_value = resp

        mock_session = MagicMock()
        mock_boto3.Session.return_value = mock_session
        mock_session.client.return_value = MagicMock()

        result = verify_aws_role(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
        )

        assert result["success"] is True
        assert result["account_id"] is None


class TestVerifyAWSRoleResultStructure:
    """Verify the shape of the returned dict."""

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_success_result_keys(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.return_value = _sts_assume_role_response()

        mock_session = MagicMock()
        mock_boto3.Session.return_value = mock_session
        mock_session.client.return_value = MagicMock()

        result = verify_aws_role(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
        )

        assert set(result.keys()) == {"success", "account_id", "role_arn", "services", "error"}

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_error_result_has_empty_services(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.side_effect = _client_error("AccessDenied")

        result = verify_aws_role(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
        )

        assert result["services"] == {}
        assert result["role_arn"] == "arn:aws:iam::123456789012:role/NeoGuardRole"


# ===========================================================================
# discover_aws_preview
# ===========================================================================

class TestDiscoverAWSPreviewSuccess:
    """Happy-path multi-region discovery preview."""

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_returns_success_with_resource_counts(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.return_value = _sts_assume_role_response()

        mock_session = MagicMock()
        mock_boto3.Session.return_value = mock_session

        mock_client = MagicMock()
        mock_session.client.return_value = mock_client

        # EC2 paginator returns 2 instances
        mock_paginator = MagicMock()
        mock_client.get_paginator.return_value = mock_paginator
        mock_paginator.paginate.return_value = [
            {
                "Reservations": [
                    {"Instances": [{"InstanceId": "i-1"}, {"InstanceId": "i-2"}]}
                ]
            }
        ]
        # RDS returns 1 DB
        mock_client.describe_db_instances.return_value = {
            "DBInstances": [{"DBInstanceIdentifier": "mydb"}]
        }
        # Lambda returns 0
        mock_client.list_functions.return_value = {"Functions": []}
        # DynamoDB returns 0
        mock_client.list_tables.return_value = {"TableNames": []}
        # S3 returns 3 buckets (only in us-east-1)
        mock_client.list_buckets.return_value = {
            "Buckets": [{"Name": "b1"}, {"Name": "b2"}, {"Name": "b3"}]
        }
        # ELB returns 0
        mock_client.describe_load_balancers.return_value = {"LoadBalancers": []}

        result = discover_aws_preview(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
            regions=["us-east-1"],
        )

        assert result["success"] is True
        assert result["error"] is None
        assert "us-east-1" in result["regions"]

        region_data = result["regions"]["us-east-1"]
        assert region_data["services"]["ec2"] == 2
        assert region_data["services"]["rds"] == 1
        assert region_data["services"]["s3"] == 3
        # Lambda and DynamoDB had 0 resources so they should NOT appear
        assert "lambda" not in region_data["services"]
        assert "dynamodb" not in region_data["services"]

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_totals_summed_correctly(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.return_value = _sts_assume_role_response()

        mock_session = MagicMock()
        mock_boto3.Session.return_value = mock_session
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client

        # EC2: 3 instances per region
        mock_paginator = MagicMock()
        mock_client.get_paginator.return_value = mock_paginator
        mock_paginator.paginate.return_value = [
            {"Reservations": [{"Instances": [{"InstanceId": f"i-{i}"} for i in range(3)]}]}
        ]
        # All other services: empty
        mock_client.describe_db_instances.return_value = {"DBInstances": []}
        mock_client.list_functions.return_value = {"Functions": []}
        mock_client.list_tables.return_value = {"TableNames": []}
        mock_client.list_buckets.return_value = {"Buckets": []}
        mock_client.describe_load_balancers.return_value = {"LoadBalancers": []}

        result = discover_aws_preview(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
            regions=["us-east-1", "eu-west-1"],
        )

        assert result["success"] is True
        # 3 EC2 + 0 S3 (only in us-east-1, returned 0) per region = 3 each
        # us-east-1 might also count S3 (0 in this case)
        assert result["totals"]["resources"] == 6  # 3 per region * 2 regions
        assert result["totals"]["regions_with_resources"] == 2

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_s3_only_counted_in_us_east_1(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.return_value = _sts_assume_role_response()

        mock_session = MagicMock()
        mock_boto3.Session.return_value = mock_session
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client

        # No EC2/RDS/Lambda/DDB/ELB
        mock_paginator = MagicMock()
        mock_client.get_paginator.return_value = mock_paginator
        mock_paginator.paginate.return_value = [{"Reservations": []}]
        mock_client.describe_db_instances.return_value = {"DBInstances": []}
        mock_client.list_functions.return_value = {"Functions": []}
        mock_client.list_tables.return_value = {"TableNames": []}
        mock_client.describe_load_balancers.return_value = {"LoadBalancers": []}

        # S3 returns 5 buckets
        mock_client.list_buckets.return_value = {
            "Buckets": [{"Name": f"bucket-{i}"} for i in range(5)]
        }

        result = discover_aws_preview(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
            regions=["us-east-1", "eu-west-1"],
        )

        assert result["success"] is True
        # us-east-1 should have S3=5
        assert result["regions"]["us-east-1"]["services"].get("s3") == 5
        # eu-west-1 should NOT have s3
        assert "s3" not in result["regions"]["eu-west-1"]["services"]

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_region_with_zero_resources_still_appears(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.return_value = _sts_assume_role_response()

        mock_session = MagicMock()
        mock_boto3.Session.return_value = mock_session
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client

        # All services return empty
        mock_paginator = MagicMock()
        mock_client.get_paginator.return_value = mock_paginator
        mock_paginator.paginate.return_value = [{"Reservations": []}]
        mock_client.describe_db_instances.return_value = {"DBInstances": []}
        mock_client.list_functions.return_value = {"Functions": []}
        mock_client.list_tables.return_value = {"TableNames": []}
        mock_client.list_buckets.return_value = {"Buckets": []}
        mock_client.describe_load_balancers.return_value = {"LoadBalancers": []}

        result = discover_aws_preview(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
            regions=["ap-south-1"],
        )

        assert result["success"] is True
        assert "ap-south-1" in result["regions"]
        assert result["regions"]["ap-south-1"]["total"] == 0
        assert result["totals"]["regions_with_resources"] == 0
        assert result["totals"]["resources"] == 0


class TestDiscoverAWSPreviewSTSFailure:
    """STS failure during discovery preview."""

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_sts_failure_returns_error(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.side_effect = _client_error("AccessDenied", "Forbidden")

        result = discover_aws_preview(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
            regions=["us-east-1"],
        )

        assert result["success"] is False
        assert "Cannot assume role" in result["error"]
        assert result["regions"] == {}

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_sts_unexpected_error(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.side_effect = ConnectionError("DNS resolution failed")

        result = discover_aws_preview(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
            regions=["us-east-1"],
        )

        assert result["success"] is False
        assert "Cannot assume role" in result["error"]


class TestDiscoverAWSPreviewServiceFailures:
    """Individual service failures within a region are silently ignored."""

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_service_exception_silently_ignored(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.return_value = _sts_assume_role_response()

        mock_session = MagicMock()
        mock_boto3.Session.return_value = mock_session
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client

        # Everything raises
        mock_client.get_paginator.side_effect = Exception("EC2 down")
        mock_client.describe_db_instances.side_effect = Exception("RDS down")
        mock_client.list_functions.side_effect = Exception("Lambda down")
        mock_client.list_tables.side_effect = Exception("DDB down")
        mock_client.list_buckets.side_effect = Exception("S3 down")
        mock_client.describe_load_balancers.side_effect = Exception("ELB down")

        result = discover_aws_preview(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
            regions=["us-east-1"],
        )

        # Should still succeed overall — errors are swallowed
        assert result["success"] is True
        assert "us-east-1" in result["regions"]
        assert result["regions"]["us-east-1"]["total"] == 0
        assert result["totals"]["resources"] == 0

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_partial_service_failure_counts_survivors(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.return_value = _sts_assume_role_response()

        mock_session = MagicMock()
        mock_boto3.Session.return_value = mock_session
        mock_client = MagicMock()
        mock_session.client.return_value = mock_client

        # EC2 fails
        mock_client.get_paginator.side_effect = Exception("EC2 down")
        # RDS returns 2
        mock_client.describe_db_instances.return_value = {
            "DBInstances": [{"DBInstanceIdentifier": "db1"}, {"DBInstanceIdentifier": "db2"}]
        }
        # Everything else empty
        mock_client.list_functions.return_value = {"Functions": []}
        mock_client.list_tables.return_value = {"TableNames": []}
        mock_client.list_buckets.return_value = {"Buckets": []}
        mock_client.describe_load_balancers.return_value = {"LoadBalancers": []}

        result = discover_aws_preview(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
            regions=["us-east-1"],
        )

        assert result["success"] is True
        assert result["regions"]["us-east-1"]["services"]["rds"] == 2
        assert "ec2" not in result["regions"]["us-east-1"]["services"]
        assert result["totals"]["resources"] == 2
        assert result["totals"]["regions_with_resources"] == 1


class TestDiscoverAWSPreviewMultiRegion:
    """Multi-region scan aggregation."""

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_multiple_regions_aggregated(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.return_value = _sts_assume_role_response()

        call_count = {"session": 0}

        def make_session(**kwargs):
            region = kwargs.get("region_name", "us-east-1")
            session = MagicMock()
            client = MagicMock()
            session.client.return_value = client

            # EC2: 1 instance per region
            paginator = MagicMock()
            client.get_paginator.return_value = paginator
            paginator.paginate.return_value = [
                {"Reservations": [{"Instances": [{"InstanceId": f"i-{region}"}]}]}
            ]
            # Others empty
            client.describe_db_instances.return_value = {"DBInstances": []}
            client.list_functions.return_value = {"Functions": []}
            client.list_tables.return_value = {"TableNames": []}
            client.list_buckets.return_value = {"Buckets": []}
            client.describe_load_balancers.return_value = {"LoadBalancers": []}

            return session

        mock_boto3.Session.side_effect = make_session

        result = discover_aws_preview(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
            regions=["us-east-1", "eu-west-1", "ap-southeast-1"],
        )

        assert result["success"] is True
        assert len(result["regions"]) == 3
        assert result["totals"]["resources"] == 3
        assert result["totals"]["regions_with_resources"] == 3

    @patch("neoguard.services.onboarding.verify.boto3")
    def test_empty_regions_list(self, mock_boto3):
        mock_sts = MagicMock()
        mock_boto3.client.return_value = mock_sts
        mock_sts.assume_role.return_value = _sts_assume_role_response()

        result = discover_aws_preview(
            "arn:aws:iam::123456789012:role/NeoGuardRole",
            "ng-abc",
            regions=[],
        )

        assert result["success"] is True
        assert result["regions"] == {}
        assert result["totals"]["resources"] == 0
        assert result["totals"]["regions_with_resources"] == 0


# ===========================================================================
# verify_azure_sp
# ===========================================================================

class TestVerifyAzureSPSuccess:
    """Happy-path: Azure credential + probe succeed."""

    @patch("neoguard.services.onboarding.verify.StorageManagementClient", create=True)
    @patch("neoguard.services.onboarding.verify.SqlManagementClient", create=True)
    @patch("neoguard.services.onboarding.verify.ComputeManagementClient", create=True)
    @patch("neoguard.services.onboarding.verify.ResourceManagementClient", create=True)
    @patch("neoguard.services.onboarding.verify.ClientSecretCredential", create=True)
    def test_returns_success_with_resource_groups(
        self, mock_cred_cls, mock_resource_cls, mock_compute_cls, mock_sql_cls, mock_storage_cls,
    ):
        # Patch the imports inside the function
        with patch.dict("sys.modules", {
            "azure.identity": MagicMock(ClientSecretCredential=mock_cred_cls),
            "azure.mgmt.resource": MagicMock(ResourceManagementClient=mock_resource_cls),
            "azure.mgmt.compute": MagicMock(ComputeManagementClient=mock_compute_cls),
            "azure.mgmt.sql": MagicMock(SqlManagementClient=mock_sql_cls),
            "azure.mgmt.storage": MagicMock(StorageManagementClient=mock_storage_cls),
        }):
            mock_resource_client = MagicMock()
            mock_resource_cls.return_value = mock_resource_client
            mock_resource_client.resource_groups.list.return_value = [
                MagicMock(name="rg-prod"),
                MagicMock(name="rg-staging"),
            ]

            mock_compute_client = MagicMock()
            mock_compute_cls.return_value = mock_compute_client
            mock_compute_client.virtual_machines.list_all.return_value = [
                MagicMock(name="vm-1"),
                MagicMock(name="vm-2"),
                MagicMock(name="vm-3"),
            ]

            mock_sql_client = MagicMock()
            mock_sql_cls.return_value = mock_sql_client
            mock_sql_client.servers.list.return_value = [MagicMock(name="sql-1")]

            mock_storage_client = MagicMock()
            mock_storage_cls.return_value = mock_storage_client
            mock_storage_client.storage_accounts.list.return_value = [
                MagicMock(name="storageacct1"),
                MagicMock(name="storageacct2"),
            ]

            result = verify_azure_sp(
                azure_tenant_id="aaaabbbb-cccc-dddd-eeee-ffffffffffff",
                client_id="11112222-3333-4444-5555-666677778888",
                client_secret="super-secret",
                subscription_id="aaaa1111-bbbb-2222-cccc-333344445555",
            )

        assert result["success"] is True
        assert result["error"] is None
        assert result["subscription_id"] == "aaaa1111-bbbb-2222-cccc-333344445555"
        assert result["services"]["resource_groups"]["ok"] is True
        assert result["services"]["resource_groups"]["count"] == 2
        assert result["services"]["virtual_machines"]["ok"] is True
        assert result["services"]["virtual_machines"]["count"] == 3
        assert result["services"]["sql_databases"]["ok"] is True
        assert result["services"]["sql_databases"]["count"] == 1
        assert result["services"]["storage_accounts"]["ok"] is True
        assert result["services"]["storage_accounts"]["count"] == 2


class TestVerifyAzureSPImportError:
    """Azure SDK not installed."""

    def test_import_error_returns_sdk_not_installed(self):
        # Simulate the import failing inside the function body
        import builtins
        original_import = builtins.__import__

        def mock_import(name, *args, **kwargs):
            if name in ("azure.identity", "azure.mgmt.resource"):
                raise ImportError("No module named 'azure'")
            return original_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=mock_import):
            result = verify_azure_sp(
                azure_tenant_id="tenant",
                client_id="client",
                client_secret="secret",
                subscription_id="sub",
            )

        assert result["success"] is False
        assert "Azure SDK not installed" in result["error"]
        assert result["services"] == {}


class TestVerifyAzureSPAuthErrors:
    """Azure auth failures."""

    def test_aadsts_error_returns_invalid_credentials(self):
        import builtins
        original_import = builtins.__import__

        mock_azure_identity = MagicMock()
        mock_azure_resource = MagicMock()

        def mock_import(name, *args, **kwargs):
            if name == "azure.identity":
                return mock_azure_identity
            if name == "azure.mgmt.resource":
                return mock_azure_resource
            return original_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=mock_import):
            mock_resource_client = MagicMock()
            mock_azure_resource.ResourceManagementClient.return_value = mock_resource_client
            mock_resource_client.resource_groups.list.side_effect = Exception(
                "AADSTS70011: The provided request must include a client_secret"
            )

            result = verify_azure_sp(
                azure_tenant_id="tenant",
                client_id="client",
                client_secret="bad-secret",
                subscription_id="sub",
            )

        assert result["success"] is False
        assert "Invalid credentials" in result["error"]

    def test_unauthorized_error_returns_invalid_credentials(self):
        import builtins
        original_import = builtins.__import__

        mock_azure_identity = MagicMock()
        mock_azure_resource = MagicMock()

        def mock_import(name, *args, **kwargs):
            if name == "azure.identity":
                return mock_azure_identity
            if name == "azure.mgmt.resource":
                return mock_azure_resource
            return original_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=mock_import):
            mock_resource_client = MagicMock()
            mock_azure_resource.ResourceManagementClient.return_value = mock_resource_client
            mock_resource_client.resource_groups.list.side_effect = Exception(
                "The client is unauthorized to perform this operation"
            )

            result = verify_azure_sp(
                azure_tenant_id="tenant",
                client_id="client",
                client_secret="secret",
                subscription_id="sub",
            )

        assert result["success"] is False
        assert "Invalid credentials" in result["error"]

    def test_generic_auth_error_returns_azure_auth_failed(self):
        import builtins
        original_import = builtins.__import__

        mock_azure_identity = MagicMock()
        mock_azure_resource = MagicMock()

        def mock_import(name, *args, **kwargs):
            if name == "azure.identity":
                return mock_azure_identity
            if name == "azure.mgmt.resource":
                return mock_azure_resource
            return original_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=mock_import):
            mock_resource_client = MagicMock()
            mock_azure_resource.ResourceManagementClient.return_value = mock_resource_client
            mock_resource_client.resource_groups.list.side_effect = Exception(
                "Connection timeout to Azure endpoint"
            )

            result = verify_azure_sp(
                azure_tenant_id="tenant",
                client_id="client",
                client_secret="secret",
                subscription_id="sub",
            )

        assert result["success"] is False
        assert "Azure auth failed" in result["error"]
        assert "Connection timeout" in result["error"]

    def test_long_error_message_truncated_to_300(self):
        import builtins
        original_import = builtins.__import__

        mock_azure_identity = MagicMock()
        mock_azure_resource = MagicMock()

        def mock_import(name, *args, **kwargs):
            if name == "azure.identity":
                return mock_azure_identity
            if name == "azure.mgmt.resource":
                return mock_azure_resource
            return original_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=mock_import):
            mock_resource_client = MagicMock()
            mock_azure_resource.ResourceManagementClient.return_value = mock_resource_client
            mock_resource_client.resource_groups.list.side_effect = Exception("e" * 500)

            result = verify_azure_sp(
                azure_tenant_id="tenant",
                client_id="client",
                client_secret="secret",
                subscription_id="sub",
            )

        assert result["success"] is False
        # "Azure auth failed: " prefix + up to 300 chars of error
        assert len(result["error"]) <= len("Azure auth failed: ") + 300


class TestVerifyAzureSPServiceProbes:
    """Probe failures after successful auth."""

    def test_vm_probe_failure_returns_ok_false(self):
        import builtins
        original_import = builtins.__import__

        mock_azure_identity = MagicMock()
        mock_azure_resource = MagicMock()
        mock_azure_compute = MagicMock()
        mock_azure_sql = MagicMock()
        mock_azure_storage = MagicMock()

        def mock_import(name, *args, **kwargs):
            if name == "azure.identity":
                return mock_azure_identity
            if name == "azure.mgmt.resource":
                return mock_azure_resource
            if name == "azure.mgmt.compute":
                return mock_azure_compute
            if name == "azure.mgmt.sql":
                return mock_azure_sql
            if name == "azure.mgmt.storage":
                return mock_azure_storage
            return original_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=mock_import):
            # Auth succeeds
            mock_resource_client = MagicMock()
            mock_azure_resource.ResourceManagementClient.return_value = mock_resource_client
            mock_resource_client.resource_groups.list.return_value = [MagicMock(name="rg-1")]

            # VM probe fails
            mock_compute_client = MagicMock()
            mock_azure_compute.ComputeManagementClient.return_value = mock_compute_client
            mock_compute_client.virtual_machines.list_all.side_effect = Exception(
                "Reader role does not have compute access"
            )

            # SQL succeeds
            mock_sql_client = MagicMock()
            mock_azure_sql.SqlManagementClient.return_value = mock_sql_client
            mock_sql_client.servers.list.return_value = []

            # Storage succeeds
            mock_storage_client = MagicMock()
            mock_azure_storage.StorageManagementClient.return_value = mock_storage_client
            mock_storage_client.storage_accounts.list.return_value = []

            result = verify_azure_sp(
                azure_tenant_id="tenant",
                client_id="client",
                client_secret="secret",
                subscription_id="sub",
            )

        assert result["success"] is True
        assert result["services"]["resource_groups"]["ok"] is True
        assert result["services"]["virtual_machines"]["ok"] is False
        assert "compute access" in result["services"]["virtual_machines"]["error"]
        assert result["services"]["sql_databases"]["ok"] is True
        assert result["services"]["storage_accounts"]["ok"] is True

    def test_all_probes_run_after_auth_success(self):
        import builtins
        original_import = builtins.__import__

        mock_azure_identity = MagicMock()
        mock_azure_resource = MagicMock()
        mock_azure_compute = MagicMock()
        mock_azure_sql = MagicMock()
        mock_azure_storage = MagicMock()

        def mock_import(name, *args, **kwargs):
            if name == "azure.identity":
                return mock_azure_identity
            if name == "azure.mgmt.resource":
                return mock_azure_resource
            if name == "azure.mgmt.compute":
                return mock_azure_compute
            if name == "azure.mgmt.sql":
                return mock_azure_sql
            if name == "azure.mgmt.storage":
                return mock_azure_storage
            return original_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=mock_import):
            # Auth succeeds
            mock_resource_client = MagicMock()
            mock_azure_resource.ResourceManagementClient.return_value = mock_resource_client
            mock_resource_client.resource_groups.list.return_value = [MagicMock()]

            # All probes succeed
            mock_azure_compute.ComputeManagementClient.return_value.virtual_machines.list_all.return_value = [
                MagicMock(), MagicMock()
            ]
            mock_azure_sql.SqlManagementClient.return_value.servers.list.return_value = [
                MagicMock()
            ]
            mock_azure_storage.StorageManagementClient.return_value.storage_accounts.list.return_value = [
                MagicMock(), MagicMock(), MagicMock()
            ]

            result = verify_azure_sp(
                azure_tenant_id="tenant",
                client_id="client",
                client_secret="secret",
                subscription_id="sub",
            )

        assert result["success"] is True
        # All 4 service categories should be present
        assert "resource_groups" in result["services"]
        assert "virtual_machines" in result["services"]
        assert "sql_databases" in result["services"]
        assert "storage_accounts" in result["services"]

        assert result["services"]["virtual_machines"]["count"] == 2
        assert result["services"]["sql_databases"]["count"] == 1
        assert result["services"]["storage_accounts"]["count"] == 3

    def test_probe_error_truncated_to_200(self):
        import builtins
        original_import = builtins.__import__

        mock_azure_identity = MagicMock()
        mock_azure_resource = MagicMock()
        mock_azure_compute = MagicMock()
        mock_azure_sql = MagicMock()
        mock_azure_storage = MagicMock()

        def mock_import(name, *args, **kwargs):
            if name == "azure.identity":
                return mock_azure_identity
            if name == "azure.mgmt.resource":
                return mock_azure_resource
            if name == "azure.mgmt.compute":
                return mock_azure_compute
            if name == "azure.mgmt.sql":
                return mock_azure_sql
            if name == "azure.mgmt.storage":
                return mock_azure_storage
            return original_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=mock_import):
            # Auth succeeds
            mock_resource_client = MagicMock()
            mock_azure_resource.ResourceManagementClient.return_value = mock_resource_client
            mock_resource_client.resource_groups.list.return_value = [MagicMock()]

            # VM probe fails with a very long error
            mock_compute_client = MagicMock()
            mock_azure_compute.ComputeManagementClient.return_value = mock_compute_client
            mock_compute_client.virtual_machines.list_all.side_effect = Exception("z" * 500)

            # SQL and Storage succeed
            mock_azure_sql.SqlManagementClient.return_value.servers.list.return_value = []
            mock_azure_storage.StorageManagementClient.return_value.storage_accounts.list.return_value = []

            result = verify_azure_sp(
                azure_tenant_id="tenant",
                client_id="client",
                client_secret="secret",
                subscription_id="sub",
            )

        assert result["services"]["virtual_machines"]["ok"] is False
        assert len(result["services"]["virtual_machines"]["error"]) <= 200


class TestVerifyAzureSPResultStructure:
    """Verify the shape of the returned dict."""

    def test_result_keys_on_import_error(self):
        import builtins
        original_import = builtins.__import__

        def mock_import(name, *args, **kwargs):
            if name in ("azure.identity", "azure.mgmt.resource"):
                raise ImportError("No module named 'azure'")
            return original_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=mock_import):
            result = verify_azure_sp("t", "c", "s", "sub")

        assert set(result.keys()) == {"success", "subscription_id", "services", "error"}
        assert result["subscription_id"] == "sub"

    def test_result_keys_on_success(self):
        import builtins
        original_import = builtins.__import__

        mock_azure_identity = MagicMock()
        mock_azure_resource = MagicMock()
        mock_azure_compute = MagicMock()
        mock_azure_sql = MagicMock()
        mock_azure_storage = MagicMock()

        def mock_import(name, *args, **kwargs):
            if name == "azure.identity":
                return mock_azure_identity
            if name == "azure.mgmt.resource":
                return mock_azure_resource
            if name == "azure.mgmt.compute":
                return mock_azure_compute
            if name == "azure.mgmt.sql":
                return mock_azure_sql
            if name == "azure.mgmt.storage":
                return mock_azure_storage
            return original_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=mock_import):
            mock_resource_client = MagicMock()
            mock_azure_resource.ResourceManagementClient.return_value = mock_resource_client
            mock_resource_client.resource_groups.list.return_value = []

            mock_azure_compute.ComputeManagementClient.return_value.virtual_machines.list_all.return_value = []
            mock_azure_sql.SqlManagementClient.return_value.servers.list.return_value = []
            mock_azure_storage.StorageManagementClient.return_value.storage_accounts.list.return_value = []

            result = verify_azure_sp("t", "c", "s", "sub")

        assert set(result.keys()) == {"success", "subscription_id", "services", "error"}
        # Each service entry has ok, label, and either count or error
        for svc_name, svc_data in result["services"].items():
            assert "ok" in svc_data
            assert "label" in svc_data
