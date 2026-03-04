# 立場型素材挖礦機 - Prompt Template

## 【固定 schema】（完全照抄、欄位全填）

```yaml
meta:
  topic: ""
  topic_type: ""
  source_type: ""
  source_title: ""
  source_date: ""
  source_scope: ""
  extraction_rule: "來源內容區只能使用來源明確提及或可低風險支持的內容；來源未提及一律填『來源素材未提及』；可以放大語氣，不可以放大事實。報告/社群/留言屬平台建議話術，禁止偽裝成來源已完成事實。"

fact_layer:
  core_subject: ""
  core_event_or_issue: ""
  main_entities: []
  time_context: ""
  place_context: ""
  key_numbers: []
  key_changes: []
  source_stated_causes: []
  source_stated_impacts: []
  source_stated_advice: []
  confirmed_facts_only: []

expression_layer:
  source_position: ""
  speaker_posture: ""
  emotional_charge: ""
  conflict_axis: ""
  warning_signal: ""
  contrast_point: ""
  what_source_is_pushing_back_against: ""
  what_source_seems_to_be_trying_to_wake_people_up_to: ""
  strongest_source_attitude_line: ""
  strongest_source_tension_line: ""

editorial_layer:
  editorial_one_line_summary: ""
  editorial_core_twist: ""
  editorial_you_think_but_actually: ""
  editorial_conflict_line: ""
  editorial_warning_line: ""
  editorial_explanation_line: ""
  editorial_transition_line: ""
  editorial_closing_line: ""
  editorial_personal_angle_line: ""
  editorial_most_punchy_supported_take: ""

impact_and_takeaway:
  who_is_hit_explicit: []
  who_is_hit_implied: []
  short_term_impact: ""
  medium_term_impact: ""
  long_term_impact: ""
  for_existing_participants: ""
  for_newcomers: ""
  for_observers: ""
  do_now: ""
  do_not_do: ""
  caution_note: ""

source_expression_bank:
  source_near_quote_hook_lines: []
  source_near_quote_warning_lines: []
  source_near_quote_conflict_lines: []
  source_near_quote_emotional_lines: []
  source_near_quote_transition_lines: []

editorial_compression_bank:
  editorial_hook_lines: []
  editorial_warning_lines: []
  editorial_conflict_lines: []
  editorial_explanation_lines: []
  editorial_transition_lines: []
  editorial_closing_lines: []
  editorial_contrast_lines: []
  editorial_opinionated_but_supported_lines: []

quality_control:
  explicit_points_from_source: []
  inferred_but_supported_points: []
  editorial_compressions_created: []
  unsupported_points_forbidden_to_write: []
  missing_information: []
  hallucination_risk_fields: []
  final_check: "source 類欄位必須可回指來源；editorial 類欄位可濃縮可加力道但不得新增來源未提及的事實；報告/社群/留言為平台建議話術，禁止偽裝成來源已完成事實；結尾必須包含固定句『加入1% 成為1%~』。"
```

────────────────────────
## 【補充規則】
1. 所有 *_bank 陣列若來源無對應內容，填 ["來源素材未提及"]
2. 所有 editorial_* 欄位可以濃縮、加力道、加反問，但不得新增來源沒提的數字/因果/背景
3. 動態引爆框架：前 2 字不重複、核心名詞不超過 2 次、至少 3 條修辭方向不同
4. 「不是『X』能交代」鉤子：X 必須由來源語意支持，不可憑空捏造
5. 數字砸臉：fact_layer 列數字，editorial_compression_bank.editorial_hook_lines 再用口播短句重砸一次
6. 中段預告：2–4 行，提到報告+社群+留言關鍵字（不講太完整）
7. 結尾CTA：3–6 行，完整版報告+社群+留言關鍵字+固定結尾「加入1% 成為1%~」
8. quality_control.editorial_compressions_created 必須列出：report_topic / comment_keyword_candidates / mid_roll_tease_versions / end_cta_versions

## 來源素材

{{SOURCE}}
