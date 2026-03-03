from __future__ import annotations

import hashlib
import importlib.util
import logging
import sys
import time
from pathlib import Path
from typing import Any

import httpx
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    api_base_url: str = "http://localhost:8000"
    worker_id: str = "worker-local-1"
    worker_capabilities: str = "llm,media,notebooklm"
    worker_queues: str = "q_llm,q_delivery,q_notebooklm,q_media"
    worker_poll_interval_seconds: float = 1.0
    lock_lease_seconds: int = 120
    use_external_skill_engine: bool = False
    external_skill_engine_py: str = "/Users/yaja/projects/notebooklm-flow-automation/skill_engine.py"
    skill5_root: str = "/Users/yaja/.codex_profiles/葉介/skills/script-pipeline-producer"
    skill3_root: str = "/Users/yaja/.codex_profiles/葉介/skills/fact-check-95-rewrite"
    gemini_service_account_key_path: str = ""
    gemini_project_id: str = ""
    gemini_location: str = "global"
    gemini_model: str = "gemini-2.0-flash"


settings = Settings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("worker")
_engine_cache: Any = None


def parse_csv(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(",") if item.strip()]


def claim_job(client: httpx.Client) -> dict[str, Any] | None:
    body = {
        "worker_id": settings.worker_id,
        "capabilities": parse_csv(settings.worker_capabilities),
        "queues": parse_csv(settings.worker_queues),
        "max_concurrency": 1,
    }
    resp = client.post(f"{settings.api_base_url}/api/worker/claim", json=body, timeout=20)
    resp.raise_for_status()
    return resp.json().get("job")


def acquire_lock(client: httpx.Client, resource_key: str, job_id: str, max_concurrency: int = 1) -> bool:
    resp = client.post(
        f"{settings.api_base_url}/api/worker/locks/acquire",
        json={
            "resource_key": resource_key,
            "owner": settings.worker_id,
            "job_id": job_id,
            "lease_seconds": settings.lock_lease_seconds,
            "max_concurrency": max_concurrency,
        },
        timeout=20,
    )
    resp.raise_for_status()
    return bool(resp.json().get("acquired"))


def release_lock(client: httpx.Client, resource_key: str, job_id: str) -> None:
    try:
        client.post(
            f"{settings.api_base_url}/api/worker/locks/release",
            json={"resource_key": resource_key, "owner": settings.worker_id, "job_id": job_id},
            timeout=20,
        )
    except Exception as exc:  # pragma: no cover
        logger.warning("lock release failed for %s/%s: %s", resource_key, job_id, exc)


def complete_job(
    client: httpx.Client,
    *,
    job_id: str,
    success: bool,
    output_json: dict[str, Any] | None = None,
    error: str | None = None,
    requeue: bool = False,
    delay_seconds: int = 15,
) -> None:
    payload = {
        "job_id": job_id,
        "success": success,
        "output_json": output_json or {},
        "error": error,
        "requeue": requeue,
        "delay_seconds": delay_seconds,
    }
    resp = client.post(f"{settings.api_base_url}/api/worker/complete", json=payload, timeout=30)
    resp.raise_for_status()


def _fake_skill5(input_json: dict[str, Any]) -> dict[str, Any]:
    mined = input_json.get("mined") or {}
    title = str(input_json.get("video_title") or "市場更新")
    source_material = str(input_json.get("source_material") or "")

    if not mined:
        mined = {
            "EVENT_AXIS": title,
            "S1_SHOCK_NUMBER": "3 個關鍵數字",
            "S1_TRUTH_TWIST": "你以為是短期雜訊，其實是中期結構轉向",
        }

    skill5_script = "\n".join(
        [
            "先等等，這個變化比你想的更大。",
            f"今天只講一件事：{title}",
            "第一段，先看事件主軸與數字。",
            f"重點：{mined.get('S1_SHOCK_NUMBER', '關鍵數字正在改變')}。",
            "第二段，拆因果，不講玄學。",
            f"反轉：{mined.get('S1_TRUTH_TWIST', '表面利空，實際重新定價')}。",
            "第三段，講清楚接下來你要看什麼。",
            "我們社群準備了重點清單，幫你少走彎路。",
            "留言關鍵字：我想學",
            "加入1%，成為1%",
        ]
    )

    return {
        "mined": mined,
        "skill5_script": skill5_script,
        "skill5_review": "PASS",
        "source_material": source_material,
    }


def _fake_skill3(input_json: dict[str, Any]) -> dict[str, Any]:
    external = _run_external_skill_engine(input_json)
    if external:
        return external

    title = str(input_json.get("video_title") or "市場更新")
    script5 = str(input_json.get("script_from_5") or "")

    fact_ledger = [
        {
            "id": "F01",
            "claim": title,
            "status": "mixed",
            "corrected_claim": f"{title} 需看最近 30 天資料再判斷",
            "date_scope": "近30天",
            "why_it_matters_now": "直接影響決策節奏",
            "leverage": "D",
            "sources": ["https://www.google.com/search?q=" + title],
        }
    ]

    final_script = "\n".join(
        [
            "你以為現在只是震盪，其實結構已經開始改寫。",
            "如果你繼續用舊節奏，成本會被放大。",
            "真正該看的是資金流向和時間窗，不是單點漲跌。",
            "這件事現在代表的是：市場正在重新排序贏家。",
            "可行做法是先分層配置，再觀察關鍵量能是否續航。",
            "留言關鍵字：我想學",
            "加入1%，成為1%",
        ]
    )

    digest = hashlib.sha1((script5 + final_script).encode("utf-8")).hexdigest()[:6]
    card_fields = {
        "topic": title,
        "headline": f"{title[:10]}重點",
        "subhead": "結構開始改寫",
        "metric": digest,
        "note": "加入1%，成為1%",
        "style": "v9",
    }

    return {
        "fact_ledger": fact_ledger,
        "final_script": final_script,
        "skill3_review": "PASS",
        "card_fields": card_fields,
    }


def _get_external_skill_engine() -> Any | None:
    global _engine_cache
    if _engine_cache is not None:
        return _engine_cache
    if not settings.use_external_skill_engine:
        return None

    engine_path = Path(settings.external_skill_engine_py)
    if not engine_path.exists():
        logger.warning("external skill_engine.py not found: %s", engine_path)
        return None

    project_root = str(engine_path.parent)
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    spec = importlib.util.spec_from_file_location("external_skill_engine", str(engine_path))
    if not spec or not spec.loader:
        logger.warning("unable to load external skill engine spec")
        return None

    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[attr-defined]

    cfg = mod.SkillEngineConfig(
        skill5_root=settings.skill5_root,
        skill3_root=settings.skill3_root,
        service_account_key_path=settings.gemini_service_account_key_path,
        project_id=settings.gemini_project_id,
        location=settings.gemini_location,
        model=settings.gemini_model,
    )
    _engine_cache = mod.SkillEngine(cfg)
    return _engine_cache


def _run_external_skill_engine(input_json: dict[str, Any]) -> dict[str, Any] | None:
    try:
        engine = _get_external_skill_engine()
        if not engine:
            return None
        source_material = str(input_json.get("source_material") or "")
        feedback = str(input_json.get("feedback") or "")
        if not source_material:
            return None
        result = engine.run_5_then_3(source_material=source_material, feedback=feedback)
        if not isinstance(result, dict):
            return None
        return {
            "fact_ledger": result.get("fact_ledger", []),
            "final_script": result.get("final_script", ""),
            "skill3_review": result.get("skill3_review", "PASS"),
            "card_fields": {
                "topic": str(input_json.get("video_title") or "市場"),
                "headline": str(input_json.get("video_title") or "重點更新")[:14],
                "subhead": "事實查核重寫",
                "metric": "95分",
                "note": "加入1%，成為1%",
                "style": "v9",
            },
        }
    except Exception as exc:  # pragma: no cover
        logger.exception("external skill engine failed: %s", exc)
        return None


def _fake_card(input_json: dict[str, Any]) -> dict[str, Any]:
    headline = str(input_json.get("headline") or "Story Card")
    slug = hashlib.sha1(headline.encode("utf-8")).hexdigest()[:10]
    card_url = f"https://placehold.co/1080x1920/png?text={slug}"
    return {
        "card_url": card_url,
        "card_fields": {
            "topic": input_json.get("topic"),
            "headline": input_json.get("headline"),
            "subhead": input_json.get("subhead"),
            "metric": input_json.get("metric"),
            "note": input_json.get("note"),
            "style": input_json.get("style", "v9"),
        },
    }


def process_job(client: httpx.Client, job: dict[str, Any]) -> None:
    job_id = job["id"]
    step_id = job["step_id"]
    input_json = job.get("input_json") or {}
    required = job.get("requires_capabilities_json") or []

    acquired_resources: list[str] = []
    try:
        need_notebooklm = step_id == "extract_notebooklm" or "notebooklm" in required
        if need_notebooklm:
            if not acquire_lock(client, "notebooklm", job_id, max_concurrency=1):
                complete_job(
                    client,
                    job_id=job_id,
                    success=False,
                    output_json={},
                    error="notebooklm lock unavailable",
                    requeue=True,
                    delay_seconds=15,
                )
                return
            acquired_resources.append("notebooklm")

        if step_id == "extract_notebooklm":
            title = str(input_json.get("video_title") or "YouTube 影片")
            source_material = f"NotebookLM 摘要：{title} 的核心觀點與反轉線索。"
            mined = {
                "EVENT_AXIS": title,
                "S1_SHOCK_NUMBER": "2個時間窗口",
                "S1_TRUTH_TWIST": "短期震盪掩蓋了中期趨勢",
            }
            complete_job(client, job_id=job_id, success=True, output_json={"source_material": source_material, "mined": mined})
            return

        if step_id == "extract_subtitle_gemini":
            title = str(input_json.get("video_title") or "YouTube 影片")
            source_material = f"字幕/Gemini 提取：{title} 的重點段落和關鍵句。"
            mined = {
                "EVENT_AXIS": title,
                "S1_SHOCK_NUMBER": "3個關鍵訊號",
                "S1_TRUTH_TWIST": "你以為是噪音，實際是提前反映",
            }
            complete_job(client, job_id=job_id, success=True, output_json={"source_material": source_material, "mined": mined})
            return

        if step_id == "skill5_pipeline":
            complete_job(client, job_id=job_id, success=True, output_json=_fake_skill5(input_json))
            return

        if step_id == "skill3_pipeline":
            complete_job(client, job_id=job_id, success=True, output_json=_fake_skill3(input_json))
            return

        if step_id == "generate_story_card":
            complete_job(client, job_id=job_id, success=True, output_json=_fake_card(input_json))
            return

        if step_id == "deliver_multicast":
            complete_job(client, job_id=job_id, success=True, output_json={"delivery": "ok"})
            return

        if step_id == "intent_rewrite_v2":
            complete_job(
                client,
                job_id=job_id,
                success=True,
                output_json={
                    "final_script": "【互動重寫】已根據你的回覆重寫版本二。\n加入1%，成為1%",
                },
            )
            return

        if step_id == "intent_make_card":
            complete_job(client, job_id=job_id, success=True, output_json={"card_url": _fake_card({"headline": "intent card"})["card_url"]})
            return

        if step_id == "llm_generate_v1":
            source_text = str(input_json.get("source_text", ""))
            v1_script = f"[v1] {source_text}" if source_text else "[v1] Empty input"
            complete_job(client, job_id=job_id, success=True, output_json={"v1_script": v1_script})
            return

        if step_id == "deliver_reply":
            text = str(input_json.get("text", ""))
            complete_job(client, job_id=job_id, success=True, output_json={"text": text})
            return

        complete_job(client, job_id=job_id, success=False, output_json={}, error=f"unsupported step_id: {step_id}")
    finally:
        for resource in acquired_resources:
            release_lock(client, resource, job_id)


def run() -> None:
    logger.info("worker started id=%s api=%s", settings.worker_id, settings.api_base_url)
    with httpx.Client() as client:
        while True:
            try:
                job = claim_job(client)
                if not job:
                    time.sleep(settings.worker_poll_interval_seconds)
                    continue

                logger.info("claimed job id=%s step=%s", job["id"], job["step_id"])
                process_job(client, job)
            except KeyboardInterrupt:
                raise
            except Exception as exc:
                logger.exception("worker loop error: %s", exc)
                time.sleep(max(settings.worker_poll_interval_seconds, 1))


if __name__ == "__main__":
    run()
