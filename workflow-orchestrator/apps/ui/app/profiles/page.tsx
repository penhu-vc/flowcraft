"use client";

import { useEffect, useState } from "react";
import CopyIdButton from "../components/CopyIdButton";
import IntroDetails from "../components/IntroDetails";
import { API_BASE_URL, apiRequest } from "../lib/api";

type Pipeline = {
  id: string;
  name: string;
};

type Profile = {
  id: string;
  name: string;
  pipeline_id: string;
  params_json: Record<string, unknown>;
  flags_json: Record<string, unknown>;
};

type ProfileDraft = {
  name: string;
  pipeline_id: string;
  params_json: string;
  flags_json: string;
};

function toDraft(profile: Profile): ProfileDraft {
  return {
    name: profile.name,
    pipeline_id: profile.pipeline_id,
    params_json: JSON.stringify(profile.params_json || {}, null, 2),
    flags_json: JSON.stringify(profile.flags_json || {}, null, 2),
  };
}

function parseJson(raw: string, label: string): Record<string, unknown> {
  try {
    return raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`${label} 必須是合法 JSON`);
  }
}

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ProfileDraft>>({});
  const [form, setForm] = useState<ProfileDraft>({
    name: "",
    pipeline_id: "",
    params_json: "{}",
    flags_json: "{}",
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const [profilesRes, pipelinesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/profiles`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/api/pipelines`, { cache: "no-store" }),
      ]);
      const profilesJson = (await profilesRes.json()) as Profile[];
      const pipelinesJson = (await pipelinesRes.json()) as Pipeline[];

      setProfiles(profilesJson);
      setPipelines(pipelinesJson);

      const nextDrafts: Record<string, ProfileDraft> = {};
      for (const profile of profilesJson) {
        nextDrafts[profile.id] = toDraft(profile);
      }
      setDrafts(nextDrafts);

      setForm((prev) => ({
        ...prev,
        pipeline_id: prev.pipeline_id || pipelinesJson[0]?.id || "",
      }));
      setMessage("");
    } catch (err) {
      setMessage(`載入失敗：${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createProfile() {
    try {
      await apiRequest("/api/profiles", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          pipeline_id: form.pipeline_id,
          params_json: parseJson(form.params_json, "params_json"),
          flags_json: parseJson(form.flags_json, "flags_json"),
        }),
      });
      setForm({
        name: "",
        pipeline_id: pipelines[0]?.id || "",
        params_json: "{}",
        flags_json: "{}",
      });
      await loadData();
      setMessage("Profile 建立成功");
    } catch (err) {
      setMessage(`建立失敗：${String(err)}`);
    }
  }

  async function saveProfile(profileId: string) {
    const draft = drafts[profileId];
    if (!draft) {
      return;
    }

    try {
      await apiRequest(`/api/profiles/${profileId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: draft.name,
          pipeline_id: draft.pipeline_id,
          params_json: parseJson(draft.params_json, "params_json"),
          flags_json: parseJson(draft.flags_json, "flags_json"),
        }),
      });
      await loadData();
      setMessage(`Profile 已儲存：${profileId}`);
    } catch (err) {
      setMessage(`儲存失敗：${String(err)}`);
    }
  }

  return (
    <section className="card">
      <h2>Profile（風格/客戶覆蓋）</h2>
      <p className="muted">Profile 會把同一條流程，套成不同客戶或不同語氣版本。</p>

      <IntroDetails title="這頁是做什麼？（點我展開）">
        <p><strong>name</strong>：這個 Profile 的名字，例如「穩健幣圈版」、「女友口吻版」。</p>
        <p><strong>pipeline_id</strong>：要套用哪條流程。</p>
        <p><strong>params_json</strong>：輸出參數，例如 <code>{'{"tone":"formal","cta":"follow"}'}</code>。</p>
        <p><strong>flags_json</strong>：功能開關，例如 <code>{'{"skip_fact":true}'}</code>。</p>
      </IntroDetails>

      <div className="form-grid">
        <input
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="Profile 名稱"
        />
        <select
          value={form.pipeline_id}
          onChange={(e) => setForm((prev) => ({ ...prev, pipeline_id: e.target.value }))}
        >
          {pipelines.map((pipeline) => (
            <option key={pipeline.id} value={pipeline.id}>
              {pipeline.name} ({pipeline.id.slice(0, 8)})
            </option>
          ))}
        </select>
        <button onClick={() => void createProfile()} disabled={!form.name || !form.pipeline_id}>
          新增 Profile
        </button>
      </div>

      <div className="form-grid">
        <textarea
          rows={5}
          value={form.params_json}
          onChange={(e) => setForm((prev) => ({ ...prev, params_json: e.target.value }))}
          placeholder='params_json，例如 {"tone":"formal"}'
        />
        <textarea
          rows={5}
          value={form.flags_json}
          onChange={(e) => setForm((prev) => ({ ...prev, flags_json: e.target.value }))}
          placeholder='flags_json，例如 {"skip_fact":true}'
        />
      </div>

      {message ? <p className="muted">{message}</p> : null}

      <table className="table">
        <thead>
          <tr>
            <th>名稱</th>
            <th>ID</th>
            <th>流程 ID</th>
            <th>參數 JSON</th>
            <th>旗標 JSON</th>
            <th>動作</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={6}>載入中...</td>
            </tr>
          ) : (
            profiles.map((profile) => {
              const draft = drafts[profile.id] || toDraft(profile);
              return (
                <tr key={profile.id}>
                  <td>
                    <input
                      value={draft.name}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [profile.id]: { ...draft, name: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td className="id-cell">
                    <code>{profile.id.slice(0, 8)}...</code>
                    <br />
                    <CopyIdButton value={profile.id} />
                  </td>
                  <td>
                    <select
                      value={draft.pipeline_id}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [profile.id]: { ...draft, pipeline_id: e.target.value },
                        }))
                      }
                    >
                      {pipelines.map((pipeline) => (
                        <option key={pipeline.id} value={pipeline.id}>
                          {pipeline.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <textarea
                      rows={4}
                      value={draft.params_json}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [profile.id]: { ...draft, params_json: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td>
                    <textarea
                      rows={4}
                      value={draft.flags_json}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [profile.id]: { ...draft, flags_json: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td>
                    <button onClick={() => void saveProfile(profile.id)}>儲存</button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </section>
  );
}
