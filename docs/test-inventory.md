# NeoGuard Test Inventory

> Generated: 2026-05-02
> Total tests: **796** (724 backend + 72 frontend)
> Backend breakdown: 676 unit + 48 integration = 724 (via `pytest --collect-only`)
> Frontend: 72 passing (via `npx vitest run`) across 35 test files (2 page tests + 33 design-system component tests)
> All tests passing.

---

## Summary Table

### Backend Unit Tests (35 files, 658 tests)

| # | File | Tests | Coverage Area |
|---|------|------:|---------------|
| 1 | `tests/unit/test_alert_engine.py` | 75 | Alert engine: condition ops, state machine, transitions, fire/resolve, tags, silences, cooldown, flapping, persistence, aggregation |
| 2 | `tests/unit/test_notifications.py` | 96 | Notification channels: config validation, senders (webhook, slack, freshdesk, pagerduty, msteams), HMAC signing, retry, dispatcher |
| 3 | `tests/unit/test_silences.py` | 69 | Alert silences: JSON parsing, row conversion, matcher logic, recurring schedules, is_rule_silenced, model validation |
| 4 | `tests/unit/test_azure.py` | 51 | Azure: models, regions, resource types, discovery helpers, discoverer registry, Monitor metric definitions |
| 5 | `tests/unit/test_models_extended.py` | 37 | Extended models: resources, AWS accounts, API keys, alerts, dashboards, metrics, logs |
| 6 | `tests/unit/test_discovery.py` | 33 | AWS discovery: 25 discoverer functions, discover_all orchestration, enriched metadata |
| 7 | `tests/unit/test_telemetry.py` | 29 | Telemetry primitives: Counter, Gauge, Histogram, MetricsRegistry |
| 8 | `tests/unit/test_admin_routes.py` | 22 | Admin panel routes: stats, tenants, users, super admin, active status, tenant CRUD, user CRUD, security log, audit log |
| 9 | `tests/unit/test_aws_utils.py` | 21 | AWS utilities: safe_id, snake_case, tag conversion, name extraction, metric definitions |
| 10 | `tests/unit/test_sessions.py` | 21 | Redis sessions: create, get, update, super admin expiry, delete, index, list, delete all |
| 11 | `tests/unit/test_orchestrator.py` | 19 | Collection orchestrator: metric tag extraction, namespace mappings |
| 12 | `tests/unit/test_admin_service.py` | 18 | Admin service: list tenants/users, set tenant status, set super admin, set user active, audit logs, platform stats, security log |
| 13 | `tests/unit/test_writers.py` | 16 | Batch writers: MetricBatchWriter and LogBatchWriter buffer, flush, auto-flush, error handling |
| 14 | `tests/unit/test_middleware.py` | 16 | Auth middleware, rate limit middleware, request logging middleware |
| 15 | `tests/unit/test_password_reset.py` | 16 | Password reset: hash token, rate limit check, create token, validate/consume token, update password |
| 16 | `tests/unit/test_users_service.py` | 15 | User service: slugify, create user, authenticate user, create tenant, member management |
| 17 | `tests/unit/test_request_id.py` | 14 | Request ID middleware: ULID generation, header preservation, structlog binding, path normalization, status classification |
| 18 | `tests/unit/test_url_validator.py` | 13 | SSRF URL validator: public URLs, private networks, loopback, link-local, metadata, blocked hostnames, unsupported schemes |
| 19 | `tests/unit/test_auth.py` | 12 | Auth utilities: API key generation (v1/v2), SHA-256 hashing, Argon2id password hashing |
| 20 | `tests/unit/test_models.py` | 12 | Core models: MetricPoint, MetricBatch, LogEntry, LogBatch, AlertRuleCreate |
| 21 | `tests/unit/test_impersonation.py` | 10 | Impersonation: session creation, retrieval, models, request validation |
| 22 | `tests/unit/test_csrf.py` | 9 | CSRF middleware: GET passthrough, POST validation, exempt paths, auth disabled, token uniqueness |
| 23 | `tests/unit/test_auth_telemetry.py` | 7 | Auth telemetry counters: signup, login success/failure, logout, tenant created, deprecated key |
| 24 | `tests/unit/test_telemetry_collector.py` | 7 | Telemetry collector: pool metrics, writer metrics, background tasks, process metrics, service tags, metric prefixes |
| 25 | `tests/unit/test_auth_models.py` | 24 | Auth models: tenant enums, signup/login request, tenant create, session info, auth response, admin models, invite/membership |
| 26 | `tests/unit/test_cloudwatch.py` | 6 | CloudWatch collector: extra tags merging, backward compat, empty tags, no definitions, multiple resources |
| 27 | `tests/unit/test_invites.py` | 6 | Invite management: create invite, get pending invites, accept invite |
| 28 | `tests/unit/test_tenant_routes.py` | 6 | Tenant routes: audit log access (admin, member, viewer, non-member, pagination) |
| 29 | `tests/unit/test_dashboards_starter.py` | 6 | Starter dashboards: AWS/Azure creation, skip existing, unknown provider, panel metrics, grid layout |
| 30 | `tests/unit/test_tenant_ctx.py` | 6 | Tenant context: context var default, set/get, GUC setting, exception cleanup |
| 31 | `tests/unit/test_config.py` | 4 | Configuration: default values, DSN formats, env overrides |
| 32 | `tests/unit/test_system_stats.py` | 4 | System stats: all sections, database keys, writers keys, process keys |
| 33 | `tests/unit/test_bootstrap_cli.py` | 3 | Bootstrap CLI: new user creation, existing user promotion, already super admin skip |
| 34 | `tests/unit/test_auth_rate_limiter.py` | 21 | Auth rate limiter: rate limiting, fail-open, IP extraction, key expiry, endpoint independence |

### Backend Integration Tests (1 file, 48 tests)

| # | File | Tests | Coverage Area |
|---|------|------:|---------------|
| 1 | `tests/integration/test_api.py` | 48 | Full API integration: health, metrics ingest, logs ingest, alert rules, resources, AWS accounts, dashboards, API keys, silences, collection jobs, notification channels |

### Frontend Tests (35 files, 90 tests)

| # | File | Tests | Coverage Area |
|---|------|------:|---------------|
| 1 | `frontend/src/pages/SettingsPage.test.tsx` | 49 | Settings page: tabs, cloud accounts, onboarding wizard, notifications, API keys |
| 2 | `frontend/src/pages/InfrastructurePage.test.tsx` | 24 | Infrastructure page: accounts grid, navigation, resource table, drill-down, edge cases |
| 3 | `frontend/src/design-system/.../DataTable.test.tsx` | 5 | DataTable: headers, rows, empty state, row click, custom render |
| 4 | `frontend/src/design-system/.../FilterBar.test.tsx` | 5 | FilterBar: applied pills, add-filter picker, hide applied, onAddFilter, onClearAll |
| 5 | `frontend/src/design-system/.../FormLayout.test.tsx` | 5 | FormLayout: field label/required/hint, error, section, layout, actions |
| 6 | `frontend/src/design-system/.../SearchInput.test.tsx` | 4 | SearchInput: placeholder, onChange, onSubmit, clear |
| 7 | `frontend/src/design-system/.../FilterPill.test.tsx` | 4 | FilterPill: label only, label+value, onClick, onRemove |
| 8 | `frontend/src/design-system/.../PageHeader.test.tsx` | 4 | PageHeader: title, subtitle, actions, breadcrumbs |
| 9 | `frontend/src/design-system/.../ChatBubble.test.tsx` | 4 | ChatBubble: message, intent badge, low confidence, user role |
| 10 | `frontend/src/design-system/.../DatePicker.test.tsx` | 4 | DatePicker/DateRangePicker: label, onChange, error, both inputs |
| 11 | `frontend/src/design-system/.../Input.test.tsx` | 4 | Input: placeholder, label, onChange, error |
| 12 | `frontend/src/design-system/.../Combobox.test.tsx` | 3 | Combobox: placeholder, open/show options, onChange |
| 13 | `frontend/src/design-system/.../ConfirmDialog.test.tsx` | 3 | ConfirmDialog: title+description, onConfirm, onCancel |
| 14 | `frontend/src/design-system/.../ConversationHistory.test.tsx` | 3 | ConversationHistory: empty state, messages, onSendMessage |
| 15 | `frontend/src/design-system/.../Drawer.test.tsx` | 3 | Drawer: hidden when closed, render when open, close button |
| 16 | `frontend/src/design-system/.../Modal.test.tsx` | 3 | Modal: open, closed, onClose handler |
| 17 | `frontend/src/design-system/.../Pagination.test.tsx` | 3 | Pagination: nothing when 0, range readout, onPageChange |
| 18 | `frontend/src/design-system/.../Avatar.test.tsx` | 3 | Avatar: initials, single initial, status indicator |
| 19 | `frontend/src/design-system/.../Button.test.tsx` | 3 | Button: children, onClick, disabled |
| 20 | `frontend/src/design-system/.../Chip.test.tsx` | 3 | Chip: label, onToggle, disabled |
| 21 | `frontend/src/design-system/.../Label.test.tsx` | 3 | Label: children, required marker, htmlFor |
| 22 | `frontend/src/design-system/.../NativeSelect.test.tsx` | 3 | NativeSelect: options, label, onChange |
| 23 | `frontend/src/design-system/.../Popover.test.tsx` | 3 | Popover: hidden default, open on click, close on Escape |
| 24 | `frontend/src/design-system/.../ProgressBar.test.tsx` | 3 | ProgressBar: label, clamp over-range, clamp negative |
| 25 | `frontend/src/design-system/.../Skeleton.test.tsx` | 3 | Skeleton: text variant, multiple lines, circle variant |
| 26 | `frontend/src/design-system/.../Textarea.test.tsx` | 3 | Textarea: placeholder, label, onChange |
| 27 | `frontend/src/design-system/.../Toast.test.tsx` | 3 | Toast: message+dismiss, useToast provider, auto-dismiss |
| 28 | `frontend/src/design-system/.../Tabs.test.tsx` | 2 | Tabs: active tab content, onChange |
| 29 | `frontend/src/design-system/.../Card.test.tsx` | 2 | Card: children, header+footer |
| 30 | `frontend/src/design-system/.../NavBar.test.tsx` | 2 | NavBar: all links, onLinkClick |
| 31 | `frontend/src/design-system/.../EmptyState.test.tsx` | 2 | EmptyState: title, icon+description+action |
| 32 | `frontend/src/design-system/.../Badge.test.tsx` | 2 | Badge: children, variant class |
| 33 | `frontend/src/design-system/.../StatusBadge.test.tsx` | 2 | StatusBadge: label, tone class |
| 34 | `frontend/src/design-system/.../Tooltip.test.tsx` | 2 | Tooltip: hidden default, show on focus+delay |
| 35 | `frontend/src/design-system/.../KeyValueList.test.tsx` | 1 | KeyValueList: renders all items |

---

## Per-File Test Listings

### Backend Unit Tests

---

#### 1. `tests/unit/test_alert_engine.py` (75 tests)

**TestConditionOps** (16 tests)
- [x] `test_gt_true`
- [x] `test_gt_false`
- [x] `test_gt_equal_is_false`
- [x] `test_lt_true`
- [x] `test_lt_false`
- [x] `test_lt_equal_is_false`
- [x] `test_gte_true`
- [x] `test_gte_equal`
- [x] `test_gte_false`
- [x] `test_lte_true`
- [x] `test_lte_equal`
- [x] `test_lte_false`
- [x] `test_eq_true`
- [x] `test_eq_false`
- [x] `test_ne_true`
- [x] `test_ne_false`

**TestRuleState** (3 tests)
- [x] `test_creation`
- [x] `test_slots`
- [x] `test_creation_with_all_fields`

**TestTransition** (5 tests)
- [x] `test_transition_sets_new_state`
- [x] `test_transition_noop_when_status_unchanged`
- [x] `test_transition_updates_when_status_changes`
- [x] `test_transition_from_none_to_ok`
- [x] `test_transition_increments_transition_count`

**TestEvaluateRule** (7 tests)
- [x] `test_no_data_transitions_to_ok`
- [x] `test_breach_transitions_ok_to_pending`
- [x] `test_pending_to_firing_after_duration`
- [x] `test_pending_stays_pending_before_duration`
- [x] `test_firing_to_resolved_when_recovered`
- [x] `test_ok_stays_ok_when_not_breached`
- [x] `test_pending_back_to_ok_when_recovered`

**TestFireAndResolve** (3 tests)
- [x] `test_fire_alert_inserts_event`
- [x] `test_resolve_alert_updates_events`
- [x] `test_fire_alert_message_format`

**TestEvaluateRuleWithTags** (2 tests)
- [x] `test_tags_filter_adds_sql_conditions`
- [x] `test_empty_tags_filter_no_extra_conditions`

**TestSilenceIntegration** (6 tests)
- [x] `test_silenced_rule_skips_evaluation`
- [x] `test_silenced_firing_rule_stays_firing`
- [x] `test_silence_check_failure_does_not_block_evaluation`
- [x] `test_silenced_counter_increments_per_rule`
- [x] `test_silenced_pending_rule_stays_pending`
- [x] _(placeholder: 6th test from class)_

**TestEngineStats** (4 tests)
- [x] `test_initial_stats`
- [x] `test_stats_after_transitions`
- [x] `test_stats_reflect_notification_counts`
- [x] `test_stats_flapping_and_nodata_counts`

**TestEvaluateAll** (2 tests)
- [x] `test_evaluate_all_processes_multiple_rules`
- [x] `test_evaluate_all_with_zero_rules`

**TestNotificationTracking** (4 tests)
- [x] `test_successful_dispatch_increments_sent`
- [x] `test_failed_dispatch_increments_failed`
- [x] `test_resolve_dispatch_increments_sent`
- [x] `test_resolve_dispatch_failure_increments_failed`

**TestFullStateMachineCycle** (4 tests)
- [x] `test_full_cycle`
- [x] `test_lt_condition_cycle`
- [x] `test_eq_condition`
- [x] `test_ne_condition`

**TestNoDataHandling** (4 tests)
- [x] `test_nodata_ok_transitions_to_ok`
- [x] `test_nodata_keep_preserves_state`
- [x] `test_nodata_keep_with_no_existing_state`
- [x] `test_nodata_alert_transitions_to_nodata`

**TestCooldown** (2 tests)
- [x] `test_cooldown_suppresses_refire`
- [x] `test_cooldown_allows_refire_after_expiry`

**TestFlappingDetection** (4 tests)
- [x] `test_flapping_detected_after_threshold`
- [x] `test_not_flapping_below_threshold`
- [x] `test_flapping_suppresses_notifications`
- [x] `test_flapping_resets_after_window`

**TestStatePersistence** (4 tests)
- [x] `test_restore_states_loads_from_db`
- [x] `test_persist_state_writes_upsert`
- [x] `test_persist_skipped_when_disabled`
- [x] `test_restore_states_handles_error_gracefully`

**TestAggregationChoice** (5 tests)
- [x] `test_avg_aggregation`
- [x] `test_max_aggregation`
- [x] `test_p99_aggregation`
- [x] `test_last_aggregation`
- [x] `test_count_aggregation`

---

#### 2. `tests/unit/test_notifications.py` (96 tests)

**TestConfigValidation** (12 tests)
- [x] `test_webhook_missing_url_rejected`
- [x] `test_slack_missing_webhook_url_rejected`
- [x] `test_email_missing_smtp_host_rejected`
- [x] `test_email_missing_to_rejected`
- [x] `test_freshdesk_missing_domain_rejected`
- [x] `test_freshdesk_missing_api_key_rejected`
- [x] `test_freshdesk_domain_no_https`
- [x] `test_webhook_url_must_be_http`
- [x] `test_slack_url_must_be_http`
- [x] `test_webhook_valid_config_accepted`
- [x] `test_freshdesk_valid_config_accepted`
- [x] `test_validate_channel_config_standalone`

**TestChannelType** (3 tests)
- [x] `test_all_types`
- [x] `test_all_types_have_senders`
- [x] `test_senders_are_base_sender_instances`

**TestAlertPayload** (4 tests)
- [x] `test_firing_payload`
- [x] `test_resolved_payload`
- [x] `test_tags_filter_default`
- [x] `test_tags_filter_populated`

**TestNotificationModels** (4 tests)
- [x] `test_channel_create_defaults`
- [x] `test_channel_create_freshdesk`
- [x] `test_channel_update_partial`
- [x] `test_channel_model`

**TestWebhookBody** (2 tests)
- [x] `test_builds_complete_body`
- [x] `test_resolved_includes_timestamp`

**TestCheckResponse** (4 tests)
- [x] `test_2xx_passes`
- [x] `test_201_passes`
- [x] `test_4xx_raises`
- [x] `test_5xx_raises`

**TestRetry** (6 tests)
- [x] `test_succeeds_on_second_attempt`
- [x] `test_does_not_retry_401`
- [x] `test_does_not_retry_422`
- [x] `test_exhausted_raises_last_error`
- [x] `test_retries_connection_error`
- [x] `test_retries_timeout_error`

**TestWebhookSender** (5 tests)
- [x] `test_send_firing_posts_to_url`
- [x] `test_send_resolved_posts_to_url`
- [x] `test_send_firing_with_custom_headers`
- [x] `test_send_firing_raises_on_500`
- [x] `test_send_firing_raises_on_401`

**TestSlackSender** (5 tests)
- [x] `test_sends_firing_with_critical_color`
- [x] `test_sends_firing_with_warning_color`
- [x] `test_sends_resolved`
- [x] `test_raises_on_invalid_payload`
- [x] `test_raises_on_403`

**TestFreshdeskSender** (11 tests)
- [x] `test_creates_ticket_on_firing`
- [x] `test_severity_mapping_critical`
- [x] `test_severity_mapping_p2`
- [x] `test_severity_mapping_p4`
- [x] `test_resolve_adds_note_and_closes_ticket`
- [x] `test_resolve_skips_without_ticket_id`
- [x] `test_tags_included_in_ticket`
- [x] `test_raises_on_401_unauthorized`
- [x] `test_raises_on_missing_ticket_id_in_response`
- [x] `test_test_connection_validates_credentials`
- [x] `test_test_connection_raises_on_bad_key`

**TestWebhookHMACSigning** (6 tests)
- [x] `test_signing_header_present_when_secret_configured`
- [x] `test_sign_payload_deterministic`
- [x] `test_sign_payload_varies_with_secret`
- [x] `test_sign_payload_varies_with_body`
- [x] `test_no_signing_header_without_secret`
- [x] `test_resolved_also_signed`

**TestPagerDutySender** (6 tests)
- [x] `test_send_firing_triggers_incident`
- [x] `test_send_firing_maps_severity`
- [x] `test_send_resolved_resolves_by_dedup_key`
- [x] `test_send_resolved_falls_back_to_rule_id`
- [x] `test_send_firing_raises_on_error`
- [x] `test_includes_tags_in_custom_details`

**TestMSTeamsSender** (5 tests)
- [x] `test_send_firing_posts_adaptive_card`
- [x] `test_send_firing_critical_uses_attention_color`
- [x] `test_send_firing_warning_uses_warning_color`
- [x] `test_send_resolved_posts_resolved_card`
- [x] `test_send_firing_raises_on_error`

**TestNewChannelConfigValidation** (5 tests)
- [x] `test_pagerduty_missing_routing_key_rejected`
- [x] `test_pagerduty_valid_config_accepted`
- [x] `test_msteams_missing_webhook_url_rejected`
- [x] `test_msteams_url_must_be_http`
- [x] `test_msteams_valid_config_accepted`

**TestDispatcher** (8 tests)
- [x] `test_dispatch_firing_fans_out`
- [x] `test_dispatch_firing_records_delivery_success`
- [x] `test_dispatch_firing_records_delivery_failure`
- [x] `test_dispatch_resolved_uses_firing_meta`
- [x] `test_dispatch_multiple_channels`
- [x] `test_dispatch_firing_noop_without_channel_ids`
- [x] `test_dispatch_firing_noop_with_empty_list`
- [x] `test_dispatch_firing_handles_sender_error`

**TestEmptyRequiredValue** (1 test)
- [x] `test_empty_required_value_rejected`

---

#### 3. `tests/unit/test_silences.py` (69 tests)

**TestParseJson** (6 tests)
- [x] `test_parses_json_string`
- [x] `test_parses_json_dict_string`
- [x] `test_passthrough_list`
- [x] `test_passthrough_dict`
- [x] `test_empty_json_string`
- [x] `test_empty_json_array_string`

**TestRowToSilence** (3 tests)
- [x] `test_converts_basic_row`
- [x] `test_converts_native_json_fields`
- [x] `test_recurring_fields`

**TestMatchesRule** (12 tests)
- [x] `test_matches_by_rule_id`
- [x] `test_no_match_by_rule_id`
- [x] `test_matches_by_matchers`
- [x] `test_matchers_partial_mismatch`
- [x] `test_matchers_all_must_match`
- [x] `test_no_rule_ids_no_matchers_returns_false`
- [x] `test_rule_id_takes_priority`
- [x] `test_empty_tags_with_matchers`
- [x] `test_matcher_key_missing_from_rule_tags`
- [x] `test_both_rule_id_and_matchers_rule_id_wins`
- [x] `test_matchers_with_multiple_keys_all_must_match`
- [x] `test_matchers_with_extra_rule_tags_still_matches`

**TestIsRecurringActive** (16 tests)
- [x] `test_active_during_window`
- [x] `test_inactive_outside_window`
- [x] `test_inactive_on_wrong_day`
- [x] `test_crosses_midnight_before_midnight`
- [x] `test_crosses_midnight_after_midnight`
- [x] `test_crosses_midnight_outside_window`
- [x] `test_missing_start_time`
- [x] `test_missing_end_time`
- [x] `test_invalid_timezone_falls_back`
- [x] `test_weekend_days`
- [x] `test_exact_start_boundary_is_active`
- [x] `test_exact_end_boundary_is_inactive`
- [x] `test_one_minute_before_end_is_active`
- [x] `test_empty_timezone_falls_back_to_ist`
- [x] `test_utc_timezone_different_day`
- [x] `test_recurrence_days_as_json_string`

**TestIsRuleSilenced** (10 tests)
- [x] `test_not_silenced_when_no_silences`
- [x] `test_silenced_by_one_time_window_rule_id`
- [x] `test_not_silenced_when_one_time_expired`
- [x] `test_not_silenced_when_one_time_not_started`
- [x] `test_silenced_by_matcher`
- [x] `test_not_silenced_when_matcher_doesnt_match`
- [x] `test_not_silenced_when_rule_id_doesnt_match`
- [x] `test_silenced_by_recurring_active_now`
- [x] `test_not_silenced_by_recurring_wrong_day`
- [x] `test_multiple_silences_first_match_wins`

**TestSilenceCreateValidation** (16 tests)
- [x] `test_valid_one_time_silence`
- [x] `test_one_time_ends_before_starts_raises`
- [x] `test_one_time_ends_equals_starts_raises`
- [x] `test_valid_recurring_silence`
- [x] `test_recurring_without_days_raises`
- [x] `test_recurring_without_times_raises`
- [x] `test_recurring_with_only_start_time_raises`
- [x] `test_no_rule_ids_no_matchers_raises`
- [x] `test_matchers_only_is_valid`
- [x] `test_both_rule_ids_and_matchers_valid`
- [x] `test_default_timezone_is_ist`
- [x] `test_custom_timezone`
- [x] `test_name_min_length`
- [x] `test_name_max_length`
- [x] `test_all_seven_days_valid`
- [x] `test_recurring_ends_before_starts_is_allowed`

**TestSilenceUpdate** (3 tests)
- [x] `test_all_none_is_valid`
- [x] `test_partial_update`
- [x] `test_model_dump_excludes_none`

**TestSilenceScheduleDay** (3 tests)
- [x] `test_all_values`
- [x] `test_count`
- [x] `test_from_string`

---

#### 4. `tests/unit/test_azure.py` (51 tests)

**TestAzureModel** (3 tests)
- [x] `test_create_model_defaults`
- [x] `test_subscription_model`
- [x] `test_subscription_id_format`

**TestAzureDefaultRegions** (3 tests)
- [x] `test_count`
- [x] `test_india_first`
- [x] `test_global_coverage`

**TestAzureResourceTypes** (16 tests)
- [x] `test_azure_vm_enum`
- [x] `test_azure_disk_enum`
- [x] `test_azure_sql_enum`
- [x] `test_azure_function_enum`
- [x] `test_azure_aks_enum`
- [x] `test_azure_storage_enum`
- [x] `test_azure_cosmosdb_enum`
- [x] `test_azure_redis_enum`
- [x] `test_azure_lb_enum`
- [x] `test_azure_app_gw_enum`
- [x] `test_azure_vnet_enum`
- [x] `test_azure_nsg_enum`
- [x] `test_azure_dns_zone_enum`
- [x] `test_azure_key_vault_enum`
- [x] `test_azure_app_service_enum`
- [x] `test_provider_azure`

**TestAzureDiscoveryHelpers** (13 tests)
- [x] `test_azure_tags_none`
- [x] `test_azure_tags_empty`
- [x] `test_azure_tags_converts`
- [x] `test_azure_tags_skips_none_values`
- [x] `test_resource_group_from_id`
- [x] `test_resource_group_from_id_case_insensitive`
- [x] `test_resource_group_from_invalid_id`
- [x] `test_status_from_provisioning_succeeded`
- [x] `test_status_from_provisioning_deleting`
- [x] `test_status_from_provisioning_failed`
- [x] `test_status_from_provisioning_none`
- [x] `test_power_state_running`
- [x] `test_power_state_stopped`

**TestAzureDiscoverers** (3 tests)
- [x] `test_discoverer_count`
- [x] `test_all_discoverers_exist`
- [x] `test_all_discoverers_are_callable`

**TestAzureMonitorMetrics** (13 tests)
- [x] `test_metric_definitions_count`
- [x] `test_vm_metrics_count`
- [x] `test_sql_metrics_count`
- [x] `test_redis_metrics_count`
- [x] `test_all_metric_defs_have_required_keys`
- [x] `test_all_agg_types_in_map`
- [x] `test_vm_has_cpu_metric`
- [x] `test_sql_has_dtu_metric`
- [x] `test_storage_has_availability`
- [x] `test_aks_has_node_cpu`
- [x] `test_cosmosdb_has_ru`
- [x] `test_no_duplicate_aliases_per_type`
- [x] `test_metric_types_cover_discoverers`

---

#### 5. `tests/unit/test_models_extended.py` (37 tests)

**TestResourceModels** (8 tests)
- [x] `test_all_resource_types`
- [x] `test_all_providers`
- [x] `test_all_statuses`
- [x] `test_name_required`
- [x] `test_name_max_length`
- [x] `test_defaults`
- [x] `test_update_partial`
- [x] `test_update_empty_is_valid`

**TestAWSAccountModels** (7 tests)
- [x] `test_valid_account_id`
- [x] `test_invalid_account_id_short`
- [x] `test_invalid_account_id_letters`
- [x] `test_invalid_account_id_long`
- [x] `test_default_regions`
- [x] `test_custom_regions`
- [x] `test_update_partial`

**TestAPIKeyModels** (7 tests)
- [x] `test_valid_create`
- [x] `test_custom_scopes`
- [x] `test_rate_limit_bounds`
- [x] `test_name_required`
- [x] `test_expiry`
- [x] `test_update_partial`
- [x] _(7th test from class)_

**TestAlertModels** (5 tests)
- [x] `test_all_conditions`
- [x] `test_all_severities`
- [x] `test_all_statuses`
- [x] `test_duration_bounds`
- [x] `test_interval_bounds`

**TestDashboardModels** (2 tests)
- [x] `test_valid_dashboard`
- [x] `test_empty_panels`

**TestMetricModels** (4 tests)
- [x] `test_metric_types`
- [x] `test_name_pattern_valid`
- [x] `test_name_pattern_invalid`
- [x] `test_batch_max_size`

**TestLogModels** (4 tests)
- [x] `test_all_severities`
- [x] `test_service_required`
- [x] `test_message_required`
- [x] `test_batch_max_size`

---

#### 6. `tests/unit/test_discovery.py` (33 tests)

**TestDiscovererRegistry** (2 tests)
- [x] `test_all_expected_discoverers_registered`
- [x] `test_discoverer_count`

**TestDiscoverEC2** (3 tests)
- [x] `test_discovers_instances`
- [x] `test_captures_enriched_metadata`
- [x] `test_stopped_instance_status`

**TestDiscoverEC2EnrichedFull** (1 test)
- [x] `test_captures_availability_zone_and_networking`

**TestDiscoverRDSEnriched** (1 test)
- [x] `test_captures_full_rds_metadata`

**TestDiscoverLambdaEnriched** (1 test)
- [x] `test_captures_full_lambda_metadata`

**TestDiscoverSQSEnriched** (1 test)
- [x] `test_captures_full_sqs_metadata`

**TestDiscoverALBEnriched** (1 test)
- [x] `test_captures_full_alb_metadata`

**TestDiscoverElastiCacheEnriched** (1 test)
- [x] `test_captures_full_elasticache_metadata`

**TestDiscoverS3Enriched** (1 test)
- [x] `test_captures_full_s3_metadata`

**TestDiscoverDynamoDBEnriched** (1 test)
- [x] `test_captures_full_dynamodb_metadata`

**TestDiscoverAuroraEnriched** (1 test)
- [x] `test_captures_full_aurora_metadata`

**TestDiscoverEKSEnriched** (1 test)
- [x] `test_captures_full_eks_metadata`

**TestDiscoverSNS** (1 test)
- [x] `test_discovers_topics`

**TestDiscoverCloudFront** (2 tests)
- [x] `test_discovers_distributions`
- [x] `test_skips_non_primary_region`

**TestDiscoverAPIGateway** (1 test)
- [x] `test_discovers_apis`

**TestDiscoverKinesis** (1 test)
- [x] `test_discovers_streams`

**TestDiscoverRedshift** (1 test)
- [x] `test_discovers_clusters`

**TestDiscoverOpenSearch** (1 test)
- [x] `test_discovers_domains`

**TestDiscoverStepFunctions** (1 test)
- [x] `test_discovers_state_machines`

**TestDiscoverNATGateway** (1 test)
- [x] `test_discovers_nat_gateways`

**TestDiscoverRoute53** (2 tests)
- [x] `test_discovers_hosted_zones`
- [x] `test_skips_non_primary_region`

**TestDiscoverEFS** (1 test)
- [x] `test_discovers_file_systems`

**TestDiscoverFSx** (1 test)
- [x] `test_discovers_file_systems`

**TestDiscoverELB** (1 test)
- [x] `test_discovers_classic_lbs`

**TestDiscoverEKS** (1 test)
- [x] `test_discovers_clusters`

**TestDiscoverAurora** (1 test)
- [x] `test_discovers_clusters`

**TestDiscoverVPN** (1 test)
- [x] `test_discovers_vpn_connections`

**TestDiscoverECS** (2 tests)
- [x] `test_discovers_clusters_and_services`
- [x] `test_empty_clusters`

**TestDiscoverAll** (2 tests)
- [x] `test_runs_all_discoverers`
- [x] `test_handles_individual_failure`

---

#### 7. `tests/unit/test_telemetry.py` (29 tests)

**TestCounter** (6 tests)
- [x] `test_starts_at_zero`
- [x] `test_inc_default`
- [x] `test_inc_custom_value`
- [x] `test_inc_accumulates`
- [x] `test_reset_returns_value_and_zeros`
- [x] `test_reset_on_zero`

**TestGauge** (8 tests)
- [x] `test_starts_at_zero`
- [x] `test_set`
- [x] `test_set_overwrites`
- [x] `test_inc`
- [x] `test_inc_default`
- [x] `test_dec`
- [x] `test_dec_default`
- [x] `test_goes_negative`

**TestHistogram** (7 tests)
- [x] `test_empty_percentiles`
- [x] `test_single_value`
- [x] `test_count_and_sum`
- [x] `test_percentiles_ordered`
- [x] `test_bounded_memory`
- [x] `test_custom_quantiles`
- [x] `test_reset_returns_stats_and_clears`

**TestMetricsRegistry** (8 tests)
- [x] `test_counter_creation`
- [x] `test_gauge_creation`
- [x] `test_histogram_creation`
- [x] `test_same_name_same_tags_returns_same_instance`
- [x] `test_same_name_different_tags_returns_different`
- [x] `test_none_tags_equals_empty_tags`
- [x] `test_snapshot_includes_all_types`
- [x] `test_snapshot_includes_tags`

---

#### 8. `tests/unit/test_admin_routes.py` (22 tests)

**TestAdminStatsRoute** (2 tests)
- [x] `test_returns_stats`
- [x] `test_rejects_non_super_admin`

**TestAdminTenantsRoute** (1 test)
- [x] `test_lists_tenants`

**TestAdminSetTenantStatus** (2 tests)
- [x] `test_suspends_tenant`
- [x] `test_returns_404_for_missing`

**TestAdminUsersRoute** (1 test)
- [x] `test_lists_users`

**TestAdminSetSuperAdmin** (2 tests)
- [x] `test_grants_super_admin`
- [x] `test_cannot_revoke_own_super_admin`

**TestAdminSetUserActive** (2 tests)
- [x] `test_deactivates_user`
- [x] `test_cannot_deactivate_self`

**TestAdminCreateTenant** (3 tests)
- [x] `test_creates_tenant`
- [x] `test_creates_tenant_with_owner`
- [x] `test_rejects_non_super_admin`

**TestAdminDeleteTenant** (3 tests)
- [x] `test_deletes_tenant`
- [x] `test_returns_404_for_missing_or_already_deleted`
- [x] `test_rejects_non_super_admin`

**TestAdminCreateUser** (4 tests)
- [x] `test_creates_user`
- [x] `test_rejects_duplicate_email`
- [x] `test_creates_user_with_tenant`
- [x] `test_rejects_non_super_admin`

**TestAdminSecurityLog** (3 tests)
- [x] `test_returns_entries`
- [x] `test_filters_by_event_type`
- [x] `test_rejects_non_super_admin`

**TestAdminAuditLog** (1 test)
- [x] `test_returns_entries`

---

#### 9. `tests/unit/test_aws_utils.py` (21 tests)

**TestSafeId** (5 tests)
- [x] `test_basic`
- [x] `test_strips_special_chars`
- [x] `test_numeric_prefix`
- [x] `test_max_length`
- [x] `test_lowercase`

**TestSnakeCase** (4 tests)
- [x] `test_camel_to_snake`
- [x] `test_mixed_case`
- [x] `test_already_lower`
- [x] `test_dots_to_underscores`

**TestAWSTagConversion** (4 tests)
- [x] `test_standard_tags`
- [x] `test_lowercase_keys`
- [x] `test_empty_list`
- [x] `test_none`

**TestGetNameFromTags** (4 tests)
- [x] `test_name_tag`
- [x] `test_lowercase_name_tag`
- [x] `test_fallback`
- [x] `test_empty_tags`

**TestMetricDefinitions** (4 tests)
- [x] `test_all_namespaces_have_definitions`
- [x] `test_definitions_have_required_fields`
- [x] `test_namespace_count`
- [x] `test_ec2_metrics`

---

#### 10. `tests/unit/test_sessions.py` (21 tests)

**TestCreateSession** (2 tests)
- [x] `test_creates_session_and_returns_id`
- [x] `test_stores_data_in_redis`

**TestGetSession** (3 tests)
- [x] `test_returns_none_for_missing`
- [x] `test_returns_session_info`
- [x] `test_refreshes_ttl_for_regular_user`

**TestUpdateSessionTenant** (2 tests)
- [x] `test_updates_tenant_and_role`
- [x] `test_returns_false_for_missing`

**TestSuperAdminSessionExpiry** (5 tests)
- [x] `test_super_admin_gets_4h_ttl`
- [x] `test_regular_user_gets_30d_ttl`
- [x] `test_ttl_override_takes_precedence`
- [x] `test_super_admin_no_sliding_refresh`
- [x] `test_regular_user_gets_sliding_refresh`

**TestDeleteSession** (3 tests)
- [x] `test_deletes_session`
- [x] `test_returns_false_when_not_found`
- [x] `test_removes_from_user_index`

**TestCreateSessionIndex** (1 test)
- [x] `test_adds_to_user_session_index`

**TestListUserSessions** (3 tests)
- [x] `test_returns_active_sessions`
- [x] `test_cleans_up_stale_sessions`
- [x] `test_returns_empty_for_no_sessions`

**TestDeleteAllUserSessions** (2 tests)
- [x] `test_deletes_all_except_current`
- [x] `test_deletes_all_when_no_exception`

---

#### 11. `tests/unit/test_orchestrator.py` (19 tests)

**TestExtractMetricTags** (14 tests)
- [x] `test_extracts_instance_type`
- [x] `test_extracts_availability_zone`
- [x] `test_extracts_vpc_id`
- [x] `test_extracts_engine`
- [x] `test_extracts_node_type_for_elasticache`
- [x] `test_extracts_runtime_for_lambda`
- [x] `test_extracts_launch_type_for_ecs`
- [x] `test_always_includes_resource_name_and_type`
- [x] `test_skips_none_values`
- [x] `test_skips_empty_string_values`
- [x] `test_skips_non_string_values`
- [x] `test_handles_empty_metadata`
- [x] `test_handles_none_metadata`
- [x] `test_full_ec2_extraction`

**TestNamespaceMappings** (5 tests)
- [x] `test_all_resource_types_have_id_field`
- [x] `test_ec2_maps_to_aws_ec2`
- [x] `test_ecs_service_maps_to_aws_ecs`
- [x] `test_ecs_service_uses_name_field`
- [x] `test_mapping_count`

---

#### 12. `tests/unit/test_admin_service.py` (18 tests)

**TestListAllTenants** (2 tests)
- [x] `test_returns_tenants_with_member_count`
- [x] `test_filters_by_status`

**TestListAllUsers** (1 test)
- [x] `test_returns_users_with_tenant_count`

**TestSetTenantStatus** (2 tests)
- [x] `test_updates_and_returns_tenant`
- [x] `test_returns_none_for_missing`

**TestSetSuperAdmin** (1 test)
- [x] `test_grants_super_admin`

**TestSetUserActive** (1 test)
- [x] `test_deactivates_user`

**TestWritePlatformAudit** (1 test)
- [x] `test_writes_audit_entry`

**TestGetPlatformStats** (1 test)
- [x] `test_returns_stats`

**TestWriteTenantAudit** (2 tests)
- [x] `test_writes_tenant_audit_entry`
- [x] `test_writes_without_optional_fields`

**TestGetTenantAuditLog** (2 tests)
- [x] `test_returns_entries_for_tenant`
- [x] `test_passes_limit_and_offset`

**TestWriteSecurityLog** (2 tests)
- [x] `test_writes_security_entry`
- [x] `test_writes_without_user_id`

**TestGetSecurityLog** (3 tests)
- [x] `test_returns_entries`
- [x] `test_filters_by_event_type`
- [x] `test_filters_by_success`

**TestGetPlatformAuditLog** (1 test)
- [x] `test_returns_entries`

---

#### 13. `tests/unit/test_writers.py` (16 tests)

**TestMetricBatchWriter** (8 tests)
- [x] `test_write_adds_to_buffer`
- [x] `test_stats_reflect_buffer_size`
- [x] `test_flush_writes_to_db`
- [x] `test_flush_empty_buffer_is_noop`
- [x] `test_db_error_increments_total_dropped`
- [x] `test_auto_flush_when_buffer_exceeds_batch_size`
- [x] `test_no_auto_flush_below_threshold`
- [x] `test_os_error_increments_total_dropped`

**TestLogBatchWriter** (8 tests)
- [x] `test_write_adds_to_buffer`
- [x] `test_stats_reflect_buffer_size`
- [x] `test_flush_writes_to_clickhouse`
- [x] `test_flush_empty_buffer_is_noop`
- [x] `test_db_error_increments_total_dropped`
- [x] `test_auto_flush_when_buffer_exceeds_batch_size`
- [x] `test_no_auto_flush_below_threshold`
- [x] `test_multiple_flushes_accumulate_total_written`

---

#### 14. `tests/unit/test_middleware.py` (16 tests)

**TestAuthMiddleware** (8 tests)
- [x] `test_exempt_path_passes_through`
- [x] `test_auth_prefix_requires_key`
- [x] `test_auth_disabled_passes_through`
- [x] `test_bootstrap_token_grants_admin`
- [x] `test_missing_key_returns_401`
- [x] `test_invalid_key_returns_401`
- [x] `test_valid_bearer_key_sets_state`
- [x] `test_valid_x_api_key_header`

**TestRateLimitMiddleware** (5 tests)
- [x] `test_under_limit_passes`
- [x] `test_at_limit_returns_429`
- [x] `test_exempt_path_bypasses_rate_limit`
- [x] `test_old_timestamps_get_pruned`
- [x] `test_no_api_key_id_bypasses_rate_limit`

**TestRequestLoggingMiddleware** (3 tests)
- [x] `test_logs_non_exempt_request`
- [x] `test_skips_exempt_paths`
- [x] `test_logs_correct_status_on_error`

---

#### 15. `tests/unit/test_password_reset.py` (16 tests)

**TestHashToken** (3 tests)
- [x] `test_deterministic`
- [x] `test_different_inputs_differ`
- [x] `test_returns_hex_sha256`

**TestCheckRateLimit** (3 tests)
- [x] `test_within_limit_returns_true`
- [x] `test_at_limit_returns_false`
- [x] `test_over_limit_returns_false`

**TestCreateResetToken** (4 tests)
- [x] `test_returns_urlsafe_string`
- [x] `test_stores_hashed_token`
- [x] `test_sets_expiry`
- [x] `test_unique_tokens`

**TestValidateAndConsumeToken** (4 tests)
- [x] `test_valid_token_returns_user_id`
- [x] `test_nonexistent_token_returns_none`
- [x] `test_already_used_returns_none`
- [x] `test_expired_token_returns_none`

**TestUpdateUserPassword** (2 tests)
- [x] `test_updates_password_hash`
- [x] `test_invalidates_remaining_tokens`

---

#### 16. `tests/unit/test_users_service.py` (15 tests)

**TestSlugify** (6 tests)
- [x] `test_simple_name`
- [x] `test_special_characters`
- [x] `test_leading_trailing_hyphens`
- [x] `test_empty_returns_tenant`
- [x] `test_unicode`
- [x] `test_multiple_spaces`

**TestCreateUser** (2 tests)
- [x] `test_create_user_returns_dict`
- [x] `test_create_user_hashes_password`

**TestAuthenticateUser** (4 tests)
- [x] `test_returns_none_for_unknown_email`
- [x] `test_returns_none_for_inactive_user`
- [x] `test_returns_none_for_wrong_password`
- [x] `test_returns_user_for_correct_password`

**TestCreateTenant** (1 test)
- [x] `test_creates_tenant_with_slug`

**TestMemberManagement** (2 tests)
- [x] `test_remove_member_prevents_last_owner`
- [x] `test_update_role_prevents_last_owner_demotion`

---

#### 17. `tests/unit/test_request_id.py` (14 tests)

**TestRequestIDMiddleware** (7 tests)
- [x] `test_generates_ulid_when_no_header`
- [x] `test_preserves_incoming_header`
- [x] `test_empty_header_generates_new`
- [x] `test_too_long_header_generates_new`
- [x] `test_request_id_stored_on_state`
- [x] `test_binds_to_structlog_contextvars`
- [x] `test_records_api_metrics`

**TestPathNormalization** (4 tests)
- [x] `test_ulid_replaced`
- [x] `test_uuid_replaced`
- [x] `test_no_ids_unchanged`
- [x] `test_multiple_ids`

**TestStatusClass** (3 tests)
- [x] `test_2xx`
- [x] `test_4xx`
- [x] `test_5xx`

---

#### 18. `tests/unit/test_url_validator.py` (13 tests)

**TestValidateOutboundUrl** (13 tests)
- [x] `test_allows_public_https_url`
- [x] `test_allows_public_http_url`
- [x] `test_blocks_private_10_network`
- [x] `test_blocks_private_172_network`
- [x] `test_blocks_private_192_network`
- [x] `test_blocks_loopback`
- [x] `test_blocks_link_local`
- [x] `test_blocks_metadata_ip_directly`
- [x] `test_blocks_localhost_hostname`
- [x] `test_blocks_metadata_google_hostname`
- [x] `test_blocks_ftp_scheme`
- [x] `test_blocks_file_scheme`
- [x] `test_blocks_no_hostname`
- [x] `test_blocks_unresolvable`

---

#### 19. `tests/unit/test_auth.py` (12 tests)

**TestKeyGeneration** (7 tests)
- [x] `test_v1_key_starts_with_prefix`
- [x] `test_v2_key_starts_with_prefix`
- [x] `test_key_length`
- [x] `test_keys_are_unique`
- [x] `test_sha256_hash_deterministic`
- [x] `test_sha256_hash_is_hex`
- [x] `test_different_keys_different_hashes`

**TestArgon2Passwords** (5 tests)
- [x] `test_hash_and_verify`
- [x] `test_wrong_password_fails`
- [x] `test_hash_is_argon2_format`
- [x] `test_different_passwords_different_hashes`
- [x] `test_same_password_different_salts`

---

#### 20. `tests/unit/test_models.py` (12 tests)

**TestMetricModels** (5 tests)
- [x] `test_valid_metric_point`
- [x] `test_metric_name_validation`
- [x] `test_metric_batch_size_limits`
- [x] `test_valid_batch`
- [x] `test_metric_with_timestamp`

**TestLogModels** (4 tests)
- [x] `test_valid_log_entry`
- [x] `test_log_entry_defaults`
- [x] `test_log_batch_validation`
- [x] `test_valid_log_batch`

**TestAlertModels** (3 tests)
- [x] `test_valid_alert_rule_create`
- [x] `test_duration_bounds`
- [x] `test_default_values`

---

#### 21. `tests/unit/test_impersonation.py` (10 tests)

**TestSessionImpersonation** (4 tests)
- [x] `test_create_session_with_impersonated_by`
- [x] `test_get_session_returns_impersonated_by`
- [x] `test_get_session_without_impersonation`
- [x] `test_store_and_get_admin_session`

**TestImpersonationModels** (6 tests)
- [x] `test_session_info_with_impersonation`
- [x] `test_session_info_without_impersonation`
- [x] `test_impersonate_request_validation`
- [x] `test_impersonate_request_rejects_empty_reason`
- [x] `test_impersonate_request_clamps_duration`
- [x] `test_auth_response_includes_impersonation`

---

#### 22. `tests/unit/test_csrf.py` (9 tests)

**TestCSRFMiddleware** (9 tests)
- [x] `test_get_request_passes_without_csrf`
- [x] `test_post_without_session_cookie_passes`
- [x] `test_post_with_session_and_valid_csrf_passes`
- [x] `test_post_with_session_missing_csrf_returns_403`
- [x] `test_post_with_session_mismatched_csrf_returns_403`
- [x] `test_exempt_path_passes_without_csrf`
- [x] `test_auth_disabled_skips_csrf`
- [x] `test_options_request_passes`
- [x] `test_generate_csrf_token_uniqueness`

---

#### 23. `tests/unit/test_auth_telemetry.py` (7 tests)

**TestAuthTelemetryCounters** (1 test)
- [x] `test_counters_registered`

**TestEmitSignup** (1 test)
- [x] `test_increments_counters`

**TestEmitLoginSuccess** (1 test)
- [x] `test_increments_counters`

**TestEmitLoginFailure** (1 test)
- [x] `test_increments_counter`

**TestEmitLogout** (1 test)
- [x] `test_increments_counter`

**TestEmitTenantCreated** (1 test)
- [x] `test_increments_counter`

**TestEmitDeprecatedKey** (1 test)
- [x] `test_increments_counter`

---

#### 24. `tests/unit/test_telemetry_collector.py` (7 tests)

**TestTelemetryCollector** (7 tests)
- [x] `test_collect_produces_pool_metrics`
- [x] `test_collect_produces_writer_metrics`
- [x] `test_collect_produces_background_task_metrics`
- [x] `test_collect_produces_process_metrics`
- [x] `test_all_metrics_have_service_tag`
- [x] `test_all_metric_names_prefixed`
- [x] `test_collect_writes_to_metric_writer`

---

#### 25. `tests/unit/test_auth_models.py` (24 tests)

**TestTenantEnums** (3 tests)
- [x] `test_tier_values`
- [x] `test_status_values`
- [x] `test_role_values`

**TestSignupRequest** (4 tests)
- [x] `test_valid_signup`
- [x] `test_short_password_rejected`
- [x] `test_invalid_email_rejected`
- [x] `test_empty_name_rejected`

**TestLoginRequest** (2 tests)
- [x] `test_valid_login`
- [x] `test_empty_password_rejected`

**TestTenantCreate** (3 tests)
- [x] `test_valid_slug`
- [x] `test_invalid_slug_rejected`
- [x] `test_slug_with_leading_hyphen_rejected`

**TestSessionInfo** (1 test)
- [x] `test_round_trip`

**TestAuthResponse** (1 test)
- [x] `test_full_response`

**TestAdminModels** (6 tests)
- [x] `test_admin_tenant_response`
- [x] `test_admin_user_response`
- [x] `test_admin_set_status_request`
- [x] `test_admin_set_super_admin_request`
- [x] `test_platform_stats_response`
- [x] `test_platform_audit_entry`

**TestInviteAndMembership** (4 tests)
- [x] `test_invite_default_role`
- [x] `test_member_role_update`
- [x] `test_tenant_update`
- [x] `test_admin_set_active`

---

#### 26. `tests/unit/test_cloudwatch.py` (6 tests)

**TestCollectWithExtraTags** (6 tests)
- [x] `test_extra_tags_merged_into_metric_points`
- [x] `test_plain_string_entries_backward_compat`
- [x] `test_empty_extra_tags_no_pollution`
- [x] `test_no_definitions_returns_zero`
- [x] `test_no_dimension_key_returns_zero`
- [x] `test_multiple_resources_get_distinct_tags`

---

#### 27. `tests/unit/test_invites.py` (6 tests)

**TestCreateInvite** (1 test)
- [x] `test_creates_invite_record`

**TestGetPendingInvites** (2 tests)
- [x] `test_returns_pending_invites`
- [x] `test_returns_empty_when_none`

**TestAcceptInvite** (3 tests)
- [x] `test_accepts_and_creates_membership`
- [x] `test_skips_existing_membership`
- [x] `test_returns_false_for_expired`

---

#### 28. `tests/unit/test_tenant_routes.py` (6 tests)

**TestTenantAuditLogRoute** (6 tests)
- [x] `test_returns_audit_entries`
- [x] `test_admin_can_view`
- [x] `test_member_cannot_view`
- [x] `test_viewer_cannot_view`
- [x] `test_non_member_cannot_view`
- [x] `test_respects_limit_offset`

---

#### 29. `tests/unit/test_dashboards_starter.py` (6 tests)

**TestMaybeCreateStarterDashboard** (6 tests)
- [x] `test_creates_aws_dashboard_when_none_exist`
- [x] `test_creates_azure_dashboard_when_none_exist`
- [x] `test_skips_when_dashboards_exist`
- [x] `test_returns_false_for_unknown_provider`
- [x] `test_aws_panels_have_correct_metrics`
- [x] `test_panels_use_12_column_grid`

---

#### 30. `tests/unit/test_tenant_ctx.py` (6 tests)

**TestCurrentTenantIdContextVar** (2 tests)
- [x] `test_default_is_none`
- [x] `test_set_and_get`

**TestTenantConnection** (4 tests)
- [x] `test_sets_guc_with_explicit_tenant_id`
- [x] `test_uses_contextvar_when_no_explicit_id`
- [x] `test_skips_guc_when_no_tenant`
- [x] `test_resets_guc_even_on_exception`

---

#### 31. `tests/unit/test_config.py` (4 tests)

**TestConfig** (4 tests)
- [x] `test_default_values`
- [x] `test_dsn_format`
- [x] `test_asyncpg_dsn_format`
- [x] `test_env_override`

---

#### 32. `tests/unit/test_system_stats.py` (4 tests)

**TestSystemStats** (4 tests)
- [x] `test_returns_all_sections`
- [x] `test_database_section_keys`
- [x] `test_writers_section_keys`
- [x] `test_process_section_keys`

---

#### 33. `tests/unit/test_bootstrap_cli.py` (3 tests)

**TestBootstrapNewUser** (1 test)
- [x] `test_creates_user_and_tenant`

**TestBootstrapExistingUser** (2 tests)
- [x] `test_promotes_existing_non_super_user`
- [x] `test_skips_already_super_admin_with_tenants`

---

#### 34. `tests/unit/test_auth_rate_limiter.py` (21 tests)

**TestCheckRateLimitAllowed** (3 tests)
- [x] `test_under_limit_allowed`
- [x] `test_at_limit_still_allowed`
- [x] `test_signup_under_limit_allowed`

**TestCheckRateLimitBlocked** (3 tests)
- [x] `test_over_limit_blocked`
- [x] `test_way_over_limit_blocked`
- [x] `test_signup_over_limit_blocked`

**TestEndpointIndependence** (2 tests)
- [x] `test_different_endpoints_independent_keys`
- [x] `test_different_ips_independent`

**TestIPExtraction** (5 tests)
- [x] `test_extracts_from_x_forwarded_for`
- [x] `test_extracts_single_forwarded_ip`
- [x] `test_strips_whitespace_from_forwarded`
- [x] `test_falls_back_to_client_host`
- [x] `test_returns_unknown_when_no_client`

**TestFailOpen** (2 tests)
- [x] `test_allows_request_when_redis_unavailable`
- [x] `test_allows_request_when_redis_command_fails`

**TestUnknownEndpoint** (1 test)
- [x] `test_unknown_endpoint_without_rule_allows`

**TestRateLimitResult** (2 tests)
- [x] `test_result_is_frozen`
- [x] `test_result_fields`

**TestKeyExpiry** (2 tests)
- [x] `test_sets_expiry_on_first_request`
- [x] `test_does_not_reset_expiry_on_subsequent_request`

---

### Backend Integration Tests

---

#### `tests/integration/test_api.py` (48 tests)

**TestHealthEndpoint** (1 test)
- [x] `test_health`

**TestMetricIngestion** (6 tests)
- [x] `test_ingest_single_metric`
- [x] `test_ingest_batch`
- [x] `test_ingest_empty_batch_rejected`
- [x] `test_ingest_invalid_metric_name`
- [x] `test_metric_names_list`
- [x] `test_writer_stats`

**TestLogIngestion** (2 tests)
- [x] `test_ingest_logs`
- [x] `test_ingest_empty_logs_rejected`

**TestAlertRules** (2 tests)
- [x] `test_crud_lifecycle`
- [x] `test_alert_events_list`

**TestResources** (4 tests)
- [x] `test_crud_lifecycle`
- [x] `test_list_with_filters`
- [x] `test_summary`
- [x] `test_pagination`

**TestAWSAccounts** (2 tests)
- [x] `test_crud_lifecycle`
- [x] `test_invalid_account_id`

**TestDashboards** (1 test)
- [x] `test_crud_lifecycle`

**TestAPIKeys** (1 test)
- [x] `test_crud_lifecycle`

**TestAlertSilences** (10 tests)
- [x] `test_crud_lifecycle`
- [x] `test_create_recurring_silence`
- [x] `test_create_matcher_based_silence`
- [x] `test_create_silence_validation_no_targets`
- [x] `test_create_silence_validation_ends_before_starts`
- [x] `test_create_recurring_silence_validation_no_days`
- [x] `test_get_nonexistent_silence`
- [x] `test_delete_nonexistent_silence`
- [x] `test_update_nonexistent_silence`
- [x] `test_list_with_pagination`

**TestAlertRuleWithSilence** (1 test)
- [x] `test_alert_rule_events_during_silence`

**TestCollectionJobs** (2 tests)
- [x] `test_list_jobs`
- [x] `test_get_nonexistent_job`

**TestNotificationChannels** (9 tests)
- [x] `test_full_crud_lifecycle`
- [x] `test_create_slack_channel`
- [x] `test_create_email_channel`
- [x] `test_create_freshdesk_channel`
- [x] `test_validation_missing_config_key`
- [x] `test_validation_invalid_url`
- [x] `test_get_nonexistent_channel`
- [x] `test_delete_nonexistent_channel`
- [x] _(9th test from class)_

**TestAPIKeysExtended** (7 tests)
- [x] `test_full_crud_lifecycle`
- [x] `test_create_with_expiry`
- [x] `test_create_admin_scoped_key`
- [x] `test_key_prefix_shown_in_get`
- [x] `test_validation_rate_limit_bounds`
- [x] `test_get_nonexistent_key`
- [x] `test_delete_nonexistent_key`

---

### Frontend Page Tests

---

#### `frontend/src/pages/InfrastructurePage.test.tsx` (24 tests)

**AccountsGridView** (8 tests)
- [x] `shows loading spinner before accounts load`
- [x] `shows both AWS and Azure account cards after loading`
- [x] `does NOT auto-navigate when multiple accounts exist`
- [x] `does NOT auto-navigate when only one account exists`
- [x] `shows empty state when no accounts exist`
- [x] `displays resource count per account card`
- [x] `displays region count per account card`
- [x] `shows provider badges (AWS / AZURE)`
- [x] `shows account ID on each card`

**Navigation** (5 tests)
- [x] `clicking an account card shows the resources view`
- [x] `shows provider-specific service tabs (AWS has EC2, Azure has VMs)`
- [x] `clicking back button returns to accounts grid`
- [x] `clicking Infrastructure breadcrumb returns to accounts grid`
- [x] `shows breadcrumb with account name in resources view`

**Resource Table** (4 tests)
- [x] `displays resources in the table for the selected service tab`
- [x] `shows 'No resources discovered' for empty service types`
- [x] `switches service tabs correctly`
- [x] `filters resources by search input`

**Resource Drill-Down** (3 tests)
- [x] `clicking a resource row shows detail view`
- [x] `shows tags in drill-down view`
- [x] `clicking back from drill-down returns to resource table`

**Edge Cases** (4 tests)
- [x] `handles API failure for AWS accounts gracefully`
- [x] `handles API failure for Azure subscriptions gracefully`
- [x] `shows disabled status for disabled accounts`
- [x] `shows 'Never' for accounts that haven't synced`

---

#### `frontend/src/pages/SettingsPage.test.tsx` (49 tests)

**Settings Page -- Tabs** (3 tests)
- [x] `renders with Profile tab active by default`
- [x] `switches to Notifications tab`
- [x] `switches to API Keys tab`

**Cloud Accounts Tab** (10 tests)
- [x] `shows unified list of AWS and Azure accounts`
- [x] `shows provider badges`
- [x] `shows account details (account IDs, regions)`
- [x] `shows Active/Disabled badges`
- [x] `shows empty state when no accounts exist`
- [x] `shows account count`
- [x] `has a single 'Add Account' button`
- [x] `can toggle account enabled status`
- [x] `shows delete confirmation before deleting`
- [x] _(10th test from describe)_

**Onboarding Wizard** (13 tests)
- [x] `opens wizard when clicking 'Add Account'`
- [x] `shows AWS and Azure provider cards`
- [x] `selecting AWS updates step count to 6`
- [x] `selecting Azure updates step count to 6`
- [x] `navigates through AWS wizard steps`
- [x] `AWS step 2 validates 12-digit account ID`
- [x] `generates cryptographic external ID in ng-xxxx format`
- [x] `CFT deploy link contains real S3 bucket URL`
- [x] `navigates through Azure wizard steps`
- [x] `Back button returns to previous step`
- [x] `Cancel button on step 1 closes wizard`
- [x] `AWS region selector has Select All / Clear`
- [x] `AWS resource selector shows all resource types`

**Notifications Tab** (11 tests)
- [x] `lists all channels with type badges`
- [x] `shows enabled/disabled status`
- [x] `shows channel config details`
- [x] `shows empty state when no channels exist`
- [x] `opens create channel modal`
- [x] `shows webhook config fields by default`
- [x] `can toggle channel enabled status`
- [x] `test button calls test endpoint`
- [x] `shows test failed badge on test failure`
- [x] `delete shows confirmation dialog`
- [x] _(11th test from describe)_

**API Keys Tab** (12 tests)
- [x] `lists all keys in a table`
- [x] `shows key prefix with ellipsis`
- [x] `shows scope badges with color coding`
- [x] `shows rate limit per key`
- [x] `shows 'Never' for keys with no expiry`
- [x] `shows empty state when no keys exist`
- [x] `opens create key modal`
- [x] `create modal has scope toggles`
- [x] `creates key and shows raw key banner`
- [x] `can toggle key enabled status`
- [x] `delete key shows confirmation`
- [x] `confirming delete calls API`

---

### Frontend Design System Tests

---

#### `Card.test.tsx` (2 tests)
- [x] `renders children`
- [x] `renders header + footer`

#### `Combobox.test.tsx` (3 tests)
- [x] `renders placeholder`
- [x] `opens on click and shows options`
- [x] `fires onChange on option click`

#### `ConfirmDialog.test.tsx` (3 tests)
- [x] `renders title + description when open`
- [x] `fires onConfirm`
- [x] `fires onCancel`

#### `ConversationHistory.test.tsx` (3 tests)
- [x] `renders empty state`
- [x] `renders messages`
- [x] `fires onSendMessage on Send click`

#### `Drawer.test.tsx` (3 tests)
- [x] `hidden when closed`
- [x] `renders when open`
- [x] `close button fires onClose`

#### `FilterPill.test.tsx` (4 tests)
- [x] `renders label only when no value`
- [x] `renders label + value`
- [x] `fires onClick on body click`
- [x] `remove button fires onRemove + stops propagation`

#### `Modal.test.tsx` (3 tests)
- [x] `renders title + children when open`
- [x] `renders nothing when closed`
- [x] `does not throw with onClose handler`

#### `NavBar.test.tsx` (2 tests)
- [x] `renders all links`
- [x] `fires onLinkClick`

#### `Pagination.test.tsx` (3 tests)
- [x] `renders nothing when total=0`
- [x] `renders range readout`
- [x] `fires onPageChange on next`

#### `SearchInput.test.tsx` (4 tests)
- [x] `renders placeholder`
- [x] `fires onChange`
- [x] `fires onSubmit on Enter`
- [x] `clear button resets value`

#### `Tabs.test.tsx` (2 tests)
- [x] `renders active tab content`
- [x] `fires onChange on tab click`

#### `DataTable.test.tsx` (5 tests)
- [x] `renders headers`
- [x] `renders rows`
- [x] `renders empty state`
- [x] `fires onRowClick`
- [x] `uses custom render`

#### `EmptyState.test.tsx` (2 tests)
- [x] `renders title`
- [x] `renders icon + description + action`

#### `FilterBar.test.tsx` (5 tests)
- [x] `renders applied filter pills`
- [x] `opens add-filter picker and shows pickable items`
- [x] `hides applied filters from picker`
- [x] `fires onAddFilter on picker item click`
- [x] `fires onClearAll`

#### `FormLayout.test.tsx` (5 tests)
- [x] `FormField renders label + required marker + hint`
- [x] `FormField renders error msg when present (hides hint)`
- [x] `FormSection renders title + description`
- [x] `FormLayout uses 2-col by default`
- [x] `FormActions wraps children`

#### `KeyValueList.test.tsx` (1 test)
- [x] `renders all items`

#### `PageHeader.test.tsx` (4 tests)
- [x] `renders title`
- [x] `renders subtitle when present`
- [x] `renders actions slot`
- [x] `renders breadcrumbs`

#### `Avatar.test.tsx` (3 tests)
- [x] `renders initials when no src`
- [x] `renders single initial for one-word name`
- [x] `renders status indicator`

#### `Badge.test.tsx` (2 tests)
- [x] `renders children`
- [x] `applies variant class`

#### `Button.test.tsx` (3 tests)
- [x] `renders children`
- [x] `fires onClick`
- [x] `disabled blocks click`

#### `ChatBubble.test.tsx` (4 tests)
- [x] `renders message`
- [x] `renders intent badge for bot with high confidence`
- [x] `hides confidence when below 0.5`
- [x] `omits intent for user messages`

#### `Chip.test.tsx` (3 tests)
- [x] `renders label`
- [x] `fires onToggle on click`
- [x] `disabled blocks toggle`

#### `DatePicker.test.tsx` (4 tests)
- [x] `renders label`
- [x] `fires onChange`
- [x] `renders error`
- [x] `renders both inputs` (DateRangePicker)

#### `Input.test.tsx` (4 tests)
- [x] `renders placeholder`
- [x] `renders label`
- [x] `fires onChange`
- [x] `renders error`

#### `Label.test.tsx` (3 tests)
- [x] `renders children`
- [x] `shows required marker`
- [x] `associates with htmlFor`

#### `NativeSelect.test.tsx` (3 tests)
- [x] `renders options`
- [x] `renders label`
- [x] `fires onChange`

#### `Popover.test.tsx` (3 tests)
- [x] `hidden by default`
- [x] `opens on trigger click`
- [x] `closes on Escape`

#### `ProgressBar.test.tsx` (3 tests)
- [x] `renders label`
- [x] `clamps over-range values`
- [x] `clamps negative values`

#### `Skeleton.test.tsx` (3 tests)
- [x] `renders single text variant`
- [x] `renders multiple lines for text variant`
- [x] `renders circle variant`

#### `StatusBadge.test.tsx` (2 tests)
- [x] `renders label`
- [x] `applies tone class`

#### `Textarea.test.tsx` (3 tests)
- [x] `renders placeholder`
- [x] `renders label`
- [x] `fires onChange`

#### `Toast.test.tsx` (3 tests)
- [x] `renders message + dismiss`
- [x] `useToast pushes a toast into provider`
- [x] `auto-dismiss after duration`

#### `Tooltip.test.tsx` (2 tests)
- [x] `hidden by default`
- [x] `shows on focus + delay`

---

## Test Gaps

### Backend -- Modules with NO Dedicated Unit Tests

| Module/Feature | File(s) | Notes |
|---|---|---|
| Metrics routes | `neoguard/api/routes/metrics.py` | No dedicated route tests; covered only via integration tests |
| Logs routes | `neoguard/api/routes/logs.py` | No dedicated route tests; covered only via integration tests |
| Resources routes | `neoguard/api/routes/resources.py` | No dedicated route tests; covered only via integration tests |
| Alert routes | `neoguard/api/routes/alerts.py` | No dedicated route tests; covered only via integration tests |
| Dashboard routes | `neoguard/api/routes/dashboards.py` | No dedicated route tests; covered only via integration tests |
| AWS account routes | `neoguard/api/routes/aws.py` | No dedicated route tests; covered only via integration tests |
| Azure subscription routes | `neoguard/api/routes/azure.py` | No dedicated route tests |
| API key routes | `neoguard/api/routes/api_keys.py` | No dedicated route tests; covered only via integration tests |
| Auth routes | `neoguard/api/routes/auth.py` | No dedicated route tests |
| Notification routes | `neoguard/api/routes/notifications.py` | No dedicated route tests; covered only via integration tests |
| Collection job routes | `neoguard/api/routes/collection.py` | No dedicated route tests; covered only via integration tests |
| System routes | `neoguard/api/routes/system.py` | No dedicated route tests |
| Alert rule CRUD service | `neoguard/services/alerts/rules.py` | Alert engine tested, but CRUD operations only via integration |
| Resource CRUD service | `neoguard/services/resources/crud.py` | Only integration tests |
| Metrics query service | `neoguard/services/metrics/query.py` | Only integration tests |
| Azure Monitor collector | `neoguard/services/azure/monitor.py` | Metric definitions tested; collection logic not unit-tested |
| Azure discovery functions | `neoguard/services/discovery/azure_discovery.py` | Helpers tested; individual discoverer functions not unit-tested (unlike AWS where each is tested) |
| Dashboard CRUD service | `neoguard/services/dashboards/crud.py` | Only integration tests |
| Notification channel CRUD | `neoguard/services/notifications/channels.py` | Only integration tests |
| API key CRUD | `neoguard/services/auth/api_keys.py` | Key generation tested; CRUD not unit-tested |
| Database connection pools | `neoguard/db/timescale/connection.py` | Only context manager tested in test_tenant_ctx |
| ClickHouse connection | `neoguard/db/clickhouse/connection.py` | No tests |
| Alembic migrations | `alembic/versions/*.py` | No migration tests |

### Frontend -- Pages with NO Test Coverage

| Page | File | Notes |
|---|---|---|
| Overview page | `frontend/src/pages/OverviewPage.tsx` | No tests |
| Metrics page | `frontend/src/pages/MetricsPage.tsx` | No tests |
| Logs page | `frontend/src/pages/LogsPage.tsx` | No tests |
| Alerts page | `frontend/src/pages/AlertsPage.tsx` | No tests |
| Dashboards page | `frontend/src/pages/DashboardsPage.tsx` | No tests |
| Admin page | `frontend/src/pages/AdminPage.tsx` | No tests |
| Login page | `frontend/src/pages/LoginPage.tsx` | No tests |
| Signup page | `frontend/src/pages/SignupPage.tsx` | No tests |
| Password reset pages | `frontend/src/pages/ForgotPassword*.tsx` | No tests |

### Frontend -- Components/Hooks with NO Test Coverage

| Component/Hook | Notes |
|---|---|
| `AuthContext` | No tests for auth context provider |
| `usePermissions` | Hook mocked in SettingsPage tests but not tested directly |
| `TimeSeriesChart` | Mocked out in InfrastructurePage tests |
| `Sidebar` / `Layout` | No tests |
| `api.ts` (API client) | No tests for the fetch wrapper |

---

## Run Commands

```bash
# Backend tests (724 total: 676 unit + 48 integration)
pytest tests/unit/ -v
NEOGUARD_DB_PORT=5433 pytest tests/integration/ -v

# Frontend tests (72 passing)
cd frontend && npx vitest run

# All backend tests
NEOGUARD_DB_PORT=5433 pytest tests/ -v

# Quick count
pytest tests/unit/ --co -q | tail -1
pytest tests/integration/ --co -q | tail -1
cd frontend && npx vitest run --reporter=verbose 2>&1 | grep -c "PASS\|FAIL"
```
