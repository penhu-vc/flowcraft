from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class WorkerClaimRequest(BaseModel):
    worker_id: str
    capabilities: list[str] = Field(default_factory=list)
    queues: list[str] = Field(default_factory=list)
    max_concurrency: int = 1


class WorkerJobResponse(BaseModel):
    id: str
    run_id: str
    step_id: str
    queue_name: str
    requires_capabilities_json: list[str]
    input_json: dict[str, Any]
    attempts: int


class WorkerClaimResponse(BaseModel):
    job: WorkerJobResponse | None


class WorkerCompleteRequest(BaseModel):
    job_id: str
    success: bool
    output_json: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    requeue: bool = False
    delay_seconds: int = 15


class LockAcquireRequest(BaseModel):
    resource_key: str
    owner: str
    job_id: str
    lease_seconds: int = 120
    max_concurrency: int = 1


class LockReleaseRequest(BaseModel):
    resource_key: str
    owner: str
    job_id: str


class PipelineCreateRequest(BaseModel):
    name: str
    graph_json: dict[str, Any] = Field(default_factory=dict)
    version: int = 1
    enabled: bool = True


class PipelineUpdateRequest(BaseModel):
    name: str | None = None
    graph_json: dict[str, Any] | None = None
    version: int | None = None
    enabled: bool | None = None


class PipelineOut(BaseModel):
    id: str
    name: str
    graph_json: dict[str, Any]
    version: int
    enabled: bool


class BotCreateRequest(BaseModel):
    platform: str
    name: str
    token_secret_ref: str
    status: str = "active"
    rate_policy_json: dict[str, Any] = Field(default_factory=dict)


class BotUpdateRequest(BaseModel):
    platform: str | None = None
    name: str | None = None
    token_secret_ref: str | None = None
    status: str | None = None
    rate_policy_json: dict[str, Any] | None = None


class GroupCreateRequest(BaseModel):
    platform: str
    bot_id: str
    target_key: str
    name: str
    routing_tag: str | None = None
    enabled: bool = True


class GroupUpdateRequest(BaseModel):
    platform: str | None = None
    bot_id: str | None = None
    target_key: str | None = None
    name: str | None = None
    routing_tag: str | None = None
    enabled: bool | None = None


class ProfileCreateRequest(BaseModel):
    name: str
    pipeline_id: str
    params_json: dict[str, Any] = Field(default_factory=dict)
    flags_json: dict[str, Any] = Field(default_factory=dict)


class ProfileUpdateRequest(BaseModel):
    name: str | None = None
    pipeline_id: str | None = None
    params_json: dict[str, Any] | None = None
    flags_json: dict[str, Any] | None = None


class SourceCreateRequest(BaseModel):
    platform: str
    source_key: str
    routing_tag: str | None = None
    default_profile_id: str | None = None
    extraction_mode: str = "subtitle"
    enabled: bool = True


class SourceUpdateRequest(BaseModel):
    platform: str | None = None
    source_key: str | None = None
    routing_tag: str | None = None
    default_profile_id: str | None = None
    extraction_mode: str | None = None
    enabled: bool | None = None


class TriggerCreateRequest(BaseModel):
    name: str
    platform: str
    event_type: str = "message"
    source_key: str
    profile_id: str | None = None
    pipeline_id: str | None = None
    enabled: bool = True
    config_json: dict[str, Any] = Field(default_factory=dict)


class TriggerUpdateRequest(BaseModel):
    name: str | None = None
    platform: str | None = None
    event_type: str | None = None
    source_key: str | None = None
    profile_id: str | None = None
    pipeline_id: str | None = None
    enabled: bool | None = None
    config_json: dict[str, Any] | None = None


class TriggerQuickAddYoutubeRequest(BaseModel):
    video_url: str


class TriggerQuickAddTgRequest(BaseModel):
    chat_link: str


class TriggerRemoveSourceRequest(BaseModel):
    source_key: str


class IntentCreateRequest(BaseModel):
    platform: str
    intent_key: str
    step_id: str
    queue_name: str = "q_llm"
    enabled: bool = True


class IntentUpdateRequest(BaseModel):
    platform: str | None = None
    intent_key: str | None = None
    step_id: str | None = None
    queue_name: str | None = None
    enabled: bool | None = None


class YoutubeEventRequest(BaseModel):
    source_id: str
    video_id: str
    video_url: str
    title: str
    published_at: str | None = None


class SubscriberCreateRequest(BaseModel):
    platform: str
    user_key: str
    groups_json: list[str] = Field(default_factory=list)
    permissions_json: dict[str, Any] = Field(default_factory=dict)


class SubscriberUpdateRequest(BaseModel):
    groups_json: list[str] | None = None
    permissions_json: dict[str, Any] | None = None


class RunOut(BaseModel):
    id: str
    profile_id: str
    pipeline_id: str
    trigger_event_id: str
    status: str
    outputs_json: dict[str, Any]
    timeline_json: list[dict[str, Any]]
    created_at: datetime
    updated_at: datetime


class JobOut(BaseModel):
    id: str
    run_id: str
    step_id: str
    queue_name: str
    status: str
    lock_owner: str | None
    lock_until: datetime | None
    attempts: int
    next_retry_at: datetime
    input_json: dict[str, Any]
    output_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class LockOut(BaseModel):
    resource_key: str
    max_concurrency: int
    holders_json: list[dict[str, Any]]
    updated_at: datetime


class WorkerOut(BaseModel):
    id: str
    name: str
    capabilities_json: list[str]
    max_concurrency: int
    heartbeat_at: datetime
    status: str


class OutboxOut(BaseModel):
    id: str
    deliver_key: str
    platform: str
    target_key: str
    payload_json: dict[str, Any]
    status: str
    attempts: int
    next_retry_at: datetime
    created_at: datetime
    updated_at: datetime
