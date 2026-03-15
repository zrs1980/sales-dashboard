"""
Sales Command Center — Daily Rebuild Script
============================================
Run this in Cowork on a daily schedule (recommended: 7:00 AM).
Pulls live data from HubSpot and writes a fresh sales_dashboard.html.

SETUP:
  1. Set your HubSpot private app token below (HUBSPOT_TOKEN)
  2. Set OUTPUT_PATH to wherever you want the file saved
  3. In Cowork, schedule this script to run daily at your preferred time

REQUIREMENTS:
  pip install requests
"""

import requests
import json
import os
from datetime import datetime, timezone

# ─────────────────────────────────────────────
# CONFIG — edit these
# ─────────────────────────────────────────────
HUBSPOT_TOKEN = "YOUR_HUBSPOT_TOKEN_HERE"   # Your HubSpot private app token
OUTPUT_PATH   = r"C:\Users\YourName\Desktop\sales_dashboard.html"  # Where to save

# HubSpot identifiers (do not change)
PORTAL_ID          = "243159630"
LOOP_PIPELINE_ID   = "default"
CEBA_PIPELINE_ID   = "96753255"
RYAN_OWNER_ID      = "159716972"
CALEB_OWNER_ID     = "161027134"

# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────
HEADERS = {
    "Authorization": f"Bearer {HUBSPOT_TOKEN}",
    "Content-Type": "application/json",
}

def hs_get(url, params=None):
    r = requests.get(url, headers=HEADERS, params=params)
    r.raise_for_status()
    return r.json()

def hs_post(url, body):
    r = requests.post(url, headers=HEADERS, json=body)
    r.raise_for_status()
    return r.json()

def fmt_currency(val):
    if val is None:
        return "$0"
    try:
        n = float(val)
        if n >= 1000:
            return f"${n:,.0f}"
        return f"${n:.0f}"
    except:
        return "$0"

def days_since(date_str):
    """Returns number of days since a date string (YYYY-MM-DD or ms timestamp)."""
    if not date_str:
        return None
    try:
        if len(str(date_str)) > 10:  # ms timestamp
            dt = datetime.fromtimestamp(int(date_str) / 1000, tz=timezone.utc)
        else:
            dt = datetime.strptime(date_str[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        delta = datetime.now(timezone.utc) - dt
        return delta.days
    except:
        return None

def fmt_date(date_str):
    if not date_str:
        return "—"
    try:
        if len(str(date_str)) > 10:
            dt = datetime.fromtimestamp(int(date_str) / 1000, tz=timezone.utc)
            return dt.strftime("%b %-d")
        return date_str[:10]
    except:
        return str(date_str)[:10]

def risk_flag(days):
    if days is None:
        return "—"
    if days >= 90:
        return f'<span class="risk-flag risk-red">🔴 {days}d</span>'
    if days >= 30:
        return f'<span class="risk-flag risk-orange">🟠 {days}d</span>'
    return f'<span class="risk-flag risk-green">🟢 {days}d</span>'

# ─────────────────────────────────────────────
# HUBSPOT DATA FETCHERS
# ─────────────────────────────────────────────

def fetch_deals(pipeline_id):
    """Fetch all open deals for a given pipeline."""
    url = "https://api.hubapi.com/crm/v3/objects/deals/search"
    body = {
        "filterGroups": [{
            "filters": [
                {"propertyName": "pipeline", "operator": "EQ", "value": pipeline_id},
                {"propertyName": "dealstage", "operator": "NEQ", "value": "closedwon"},
                {"propertyName": "dealstage", "operator": "NEQ", "value": "closedlost"},
            ]
        }],
        "properties": [
            "dealname", "amount", "dealstage", "closedate", "hubspot_owner_id",
            "hs_lastmodifieddate", "notes_last_updated", "hs_num_associated_contacts",
            "hs_num_target_accounts", "hs_next_step", "description",
            "num_notes", "hs_activity_per_month"
        ],
        "limit": 100,
    }
    data = hs_post(url, body)
    return data.get("results", [])

def fetch_closed_deals(pipeline_id):
    """Fetch closed won/lost deals for a pipeline."""
    url = "https://api.hubapi.com/crm/v3/objects/deals/search"
    body = {
        "filterGroups": [
            {"filters": [
                {"propertyName": "pipeline", "operator": "EQ", "value": pipeline_id},
                {"propertyName": "dealstage", "operator": "EQ", "value": "closedwon"},
            ]},
            {"filters": [
                {"propertyName": "pipeline", "operator": "EQ", "value": pipeline_id},
                {"propertyName": "dealstage", "operator": "EQ", "value": "closedlost"},
            ]},
        ],
        "properties": ["dealname", "amount", "closedate", "dealstage"],
        "sorts": [{"propertyName": "closedate", "direction": "DESCENDING"}],
        "limit": 20,
    }
    data = hs_post(url, body)
    return data.get("results", [])

def fetch_sdr_calls(owner_id):
    """Fetch total call count for SDR."""
    url = "https://api.hubapi.com/crm/v3/objects/calls/search"
    body = {
        "filterGroups": [{"filters": [
            {"propertyName": "hubspot_owner_id", "operator": "EQ", "value": owner_id},
        ]}],
        "properties": ["hs_call_status", "hs_timestamp"],
        "limit": 1,
    }
    data = hs_post(url, body)
    return data.get("total", 0)

def fetch_leads_summary(owner_id):
    """Fetch lead counts by status."""
    url = "https://api.hubapi.com/crm/v3/objects/contacts/search"
    base_filters = [
        {"propertyName": "lifecyclestage", "operator": "EQ", "value": "lead"},
        {"propertyName": "hubspot_owner_id", "operator": "EQ", "value": owner_id},
    ]
    # Total
    body = {"filterGroups": [{"filters": base_filters}], "limit": 1}
    total = hs_post(url, body).get("total", 0)
    # By status
    counts = {}
    for status in ["NEW", "OPEN", "CONNECTED", "IN_PROGRESS"]:
        body = {
            "filterGroups": [{"filters": base_filters + [
                {"propertyName": "hs_lead_status", "operator": "EQ", "value": status}
            ]}],
            "limit": 1,
        }
        counts[status] = hs_post(url, body).get("total", 0)
    # Never contacted (num_contacted_notes = 0)
    body = {
        "filterGroups": [{"filters": base_filters + [
            {"propertyName": "num_contacted_notes", "operator": "EQ", "value": "0"}
        ]}],
        "limit": 1,
    }
    counts["ZERO_TOUCHES"] = hs_post(url, body).get("total", 0)
    return total, counts

def fetch_leads_list(owner_id, limit=500):
    """Fetch lead records for the table."""
    url = "https://api.hubapi.com/crm/v3/objects/contacts/search"
    body = {
        "filterGroups": [{"filters": [
            {"propertyName": "lifecyclestage", "operator": "EQ", "value": "lead"},
            {"propertyName": "hubspot_owner_id", "operator": "EQ", "value": owner_id},
        ]}],
        "properties": [
            "firstname", "lastname", "company", "hs_lead_status",
            "num_contacted_notes", "notes_last_contacted", "createdate"
        ],
        "sorts": [{"propertyName": "createdate", "direction": "DESCENDING"}],
        "limit": min(limit, 200),
    }
    results = []
    offset = 0
    while True:
        body["after"] = offset
        data = hs_post(url, body)
        batch = data.get("results", [])
        results.extend(batch)
        paging = data.get("paging", {})
        if not paging.get("next") or len(results) >= limit:
            break
        offset = paging["next"]["after"]
        if len(results) >= limit:
            break
    return results

def fetch_deal_note_count(deal_id):
    """Get note count for a deal via associations."""
    try:
        url = f"https://api.hubapi.com/crm/v3/objects/deals/{deal_id}/associations/notes"
        data = hs_get(url)
        return len(data.get("results", []))
    except:
        return 0

def get_stage_label(stage_id):
    stage_map = {
        "appointmentscheduled": "Demo Booked",
        "qualifiedtobuy": "Req. Analysis",
        "presentationscheduled": "Demo Complete",
        "decisionmakerboughtin": "Add'l Education",
        "contractsent": "Contract Sent",
        "closedwon": "Closed Won",
        "closedlost": "Closed Lost",
        # Add any custom stage IDs here if needed
    }
    return stage_map.get(stage_id, stage_id.replace("_", " ").title())

# ─────────────────────────────────────────────
# HTML GENERATION
# ─────────────────────────────────────────────

# Static insight notes — update these manually as deals progress
DEAL_INSIGHTS = {
    "207662035686": ("danger", "⚠️ STSS IS ALREADY A CEBA CLIENT — active implementation underway (CEBA Project Lead: Jason Tutanes). Key Loop requirement: consigned inventory. Discovery 11/20: 2-location scrap/IT business, 40 hrs/month manual reporting, Razor ERP, 10 sales reps, BOM/lot tracking, warehouse scanning. Re-engage immediately — 125+ days stalled, last Loop contact Nov 21."),
    "246937391823": ("warn", "Highly engaged. Last note Mar 9. Decision likely imminent. Follow up on any outstanding evaluation criteria."),
    "227660510923": ("warn", "100+ days post-demo with no stage movement. Actively worked. Needs clear next step or stage revision."),
    "288903902917": ("", "Active engagement, demo booked — prep materials. Consistent progression."),
    "302579429095": ("", "Good velocity. Requirements analysis ongoing — push to lock in demo date."),
    "305111678654": ("", "Early stage. In requirements analysis. Needs deeper discovery to build momentum."),
    "304631728879": ("", "Demo booked and recently active. Strong momentum."),
    "307178061537": ("", "Largest early-stage deal at $60K. Push to accelerate to demo given deal size."),
    "309858900680": ("warn", "No notes yet — new deal. Closes Apr 10. Needs discovery call and documentation ASAP."),
    "306864859866": ("", "Active and progressing. Future-state planning conversation underway."),
    "306429035254": ("", "Longest close date. Nurture cadence appropriate for timeline."),
    "295238331079": ("", "New deal stage — needs to progress. Push for requirements call."),
    "311950632684": ("warn", "Demo booked quickly but 0 notes. Needs pre-demo discovery documented."),
    # CEBA
    "253070201592": ("danger", "Complex deal: hardware/software separation, Salesforce integration, MRP planning, BOM management. Comparing NetSuite vs Acumatica. Key contacts: Scott Orn, Todd Weldy, Scott Tagwerker. SOW reviewed Jan 21. Duro PLM integration required. Close date critical — confirm or update immediately."),
    "315216041715": ("warn", "📋 RETURNING PROSPECT — prior requirements analysis May 2024 with Celigo as integration partner. Flagged in Mar 9 delivery meeting as 'potential new project.' Celigo integration likely in scope. 0 notes on this deal — needs immediate outreach and discovery."),
    "279378868982": ("warn", "New deal, low probability (10%). Needs re-engagement and discovery to determine fit and urgency."),
}

def build_deal_row(deal):
    props = deal.get("properties", {})
    deal_id = deal["id"]
    name = props.get("dealname", "Unnamed Deal")
    amount = float(props.get("amount") or 0)
    stage = get_stage_label(props.get("dealstage", ""))
    close_raw = props.get("closedate", "")
    close_str = fmt_date(close_raw)
    modified = props.get("hs_lastmodifieddate", "")
    days_in_stage = days_since(modified)

    # Close date urgency
    close_days = days_since(close_raw) if close_raw else None
    if close_days is not None and close_days < 0:  # already past
        close_display = f'<span style="color:var(--danger);font-weight:600">{close_str} ⚠</span>'
    elif close_days is not None and close_days <= 30:
        close_display = f'<span style="color:var(--danger);font-weight:600">{close_str} ⚠</span>'
    else:
        close_display = close_str

    # Probability by stage (rough defaults)
    prob_map = {
        "New Deal": 0.10, "Req. Analysis": 0.30, "Demo Booked": 0.40,
        "Demo Complete": 0.45, "Add'l Education": 0.70,
        "Contract Sent": 0.90,
    }
    prob = prob_map.get(stage, 0.10)
    weighted = amount * prob

    # Badge color
    badge_map = {
        "New Deal": "badge-gray", "Req. Analysis": "badge-green",
        "Demo Booked": "badge-blue", "Demo Complete": "badge-blue",
        "Add'l Education": "badge-orange", "Contract Sent": "badge-purple",
    }
    badge_cls = badge_map.get(stage, "badge-gray")

    # Notes count (simplified — use cached value if available)
    notes_count = props.get("num_notes", "—")

    # Insight
    insight_type, insight_text = DEAL_INSIGHTS.get(deal_id, ("", "No notes available."))
    insight_cls = f"insight-block {insight_type}".strip()

    # Notion cell
    notion_cell = '<td style="color:var(--text-muted);font-size:12px;text-align:center">—</td>'

    hs_url = f"https://app.hubspot.com/contacts/{PORTAL_ID}/record/0-3/{deal_id}"

    return f"""          <tr>
            <td><a class="deal-link" href="{hs_url}" target="_blank">{name}</a></td>
            <td><span class="badge {badge_cls}">{stage}</span></td>
            <td>{fmt_currency(amount)}</td>
            <td>{fmt_currency(weighted)}</td>
            <td>{close_display}</td>
            <td>{risk_flag(days_in_stage)}</td>
            <td>—</td>
            <td>{notes_count} notes</td>
            {notion_cell}
            <td><div class="{insight_cls}">{insight_text}</div></td>
          </tr>"""

def build_lead_row(lead, index):
    props = lead.get("properties", {})
    lid = lead["id"]
    first = props.get("firstname", "") or ""
    last = props.get("lastname", "") or ""
    name = f"{first} {last}".strip() or props.get("email", f"Lead #{lid}")
    company = props.get("company", "") or ""
    status = props.get("hs_lead_status", "NEW") or "NEW"
    touches = int(props.get("num_contacted_notes", 0) or 0)
    last_contact = props.get("notes_last_contacted", "")
    created = props.get("createdate", "")

    status_map = {
        "NEW": "badge-gray", "OPEN": "badge-blue", "IN_PROGRESS": "badge-orange",
        "CONNECTED": "badge-green", "BAD_TIMING": "badge-red",
        "ATTEMPTED_TO_CONTACT": "badge-orange",
    }
    badge_cls = status_map.get(status, "badge-gray")

    touch_color = "var(--danger)" if touches == 0 else ("var(--success)" if touches >= 7 else "var(--text-primary)")

    # 7-touch progress dots
    max_t = 7
    filled = min(touches, max_t)
    is_done = touches >= max_t
    dots = "".join(
        f'<div class="touch-dot {"done" if is_done else "filled"}"></div>' if i < filled
        else '<div class="touch-dot"></div>'
        for i in range(max_t)
    )
    progress = f'<div class="touches-bar"><div class="touches-dots">{dots}</div><span style="font-size:11px;font-family:\'DM Mono\',monospace;color:var(--text-muted)">{touches}/7</span></div>'

    last_str = fmt_date(last_contact) if last_contact else '<span style="color:var(--danger)">Never</span>'
    created_str = fmt_date(created)

    hs_url = f"https://app.hubspot.com/contacts/{PORTAL_ID}/record/0-1/{lid}"

    return f"""        <tr>
          <td style="color:var(--text-muted);font-family:'DM Mono',monospace;font-size:11px">{index}</td>
          <td><a class="deal-link" href="{hs_url}" target="_blank">{name}</a></td>
          <td style="color:var(--text-secondary);font-size:12px">{company or "—"}</td>
          <td><span class="badge {badge_cls}">{status}</span></td>
          <td><span style="font-family:'DM Mono',monospace;font-size:12px;font-weight:600;color:{touch_color}">{touches}</span></td>
          <td style="font-size:12px;color:var(--text-secondary)">{last_str}</td>
          <td style="font-size:12px;color:var(--text-muted)">{created_str}</td>
          <td>{progress}</td>
          <td><a class="deal-link" href="{hs_url}" target="_blank">Open →</a></td>
        </tr>"""

def build_bar_row(label, value, max_val, color="var(--accent)", suffix=""):
    pct = max(5, int((value / max_val) * 100)) if max_val > 0 else 5
    label_text = fmt_currency(value) + (f" — {suffix}" if suffix else "")
    return f"""          <div class="bar-row">
            <div class="bar-label">{label}</div>
            <div class="bar-track"><div class="bar-fill" style="width:{pct}%;background:{color}"><span>{label_text}</span></div></div>
            <div class="bar-amount">{fmt_currency(value)}</div>
          </div>"""

def build_kpi_card(label, value, sub, color="blue"):
    return f"""    <div class="kpi-card {color}">
      <div class="kpi-label">{label}</div>
      <div class="kpi-value">{value}</div>
      <div class="kpi-sub">{sub}</div>
    </div>"""

# ─────────────────────────────────────────────
# MAIN BUILD
# ─────────────────────────────────────────────

def build_dashboard():
    today = datetime.now().strftime("%a, %B %-d, %Y")
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Fetching HubSpot data...")

    # Fetch all data
    loop_deals = fetch_deals(LOOP_PIPELINE_ID)
    ceba_deals = fetch_deals(CEBA_PIPELINE_ID)
    ceba_closed = fetch_closed_deals(CEBA_PIPELINE_ID)
    sdr_calls = fetch_sdr_calls(CALEB_OWNER_ID)
    leads_total, leads_counts = fetch_leads_summary(RYAN_OWNER_ID)
    leads_list = fetch_leads_list(RYAN_OWNER_ID, limit=500)

    print(f"[{datetime.now().strftime('%H:%M:%S')}] Data fetched. Building HTML...")

    # ── Loop ERP KPIs ──
    loop_total = sum(float(d["properties"].get("amount") or 0) for d in loop_deals)
    loop_weighted = sum(float(d["properties"].get("amount") or 0) * 0.38 for d in loop_deals)  # rough avg
    loop_count = len(loop_deals)

    # ── CEBA KPIs ──
    ceba_open_val = sum(float(d["properties"].get("amount") or 0) for d in ceba_deals)
    ceba_won_val = sum(float(d["properties"].get("amount") or 0) for d in ceba_closed if d["properties"].get("dealstage") == "closedwon")

    # ── Deal rows ──
    loop_rows = "\n".join(build_deal_row(d) for d in loop_deals)
    ceba_rows = "\n".join(build_deal_row(d) for d in ceba_deals)
    lead_rows = "\n".join(build_lead_row(l, i+1) for i, l in enumerate(leads_list))

    # ── Closed CEBA table ──
    def ceba_history_row(d):
        props = d["properties"]
        stage = props.get("dealstage", "")
        status_cls = "badge-green" if stage == "closedwon" else "badge-red"
        status_label = "Closed Won" if stage == "closedwon" else "Closed Lost"
        hs_url = f"https://app.hubspot.com/contacts/{PORTAL_ID}/record/0-3/{d['id']}"
        return f"          <tr><td>{props.get('dealname','')}</td><td><span class='badge {status_cls}'>{status_label}</span></td><td>{fmt_currency(props.get('amount'))}</td><td>{fmt_date(props.get('closedate',''))}</td><td><a class='deal-link' href='{hs_url}' target='_blank'>View →</a></td></tr>"

    ceba_history_rows = "\n".join(ceba_history_row(d) for d in ceba_closed)

    # ── Lead rows for JS (simplified — full list as JSON for pagination) ──
    def lead_js_obj(l):
        props = l.get("properties", {})
        first = props.get("firstname", "") or ""
        last  = props.get("lastname", "") or ""
        name  = f"{first} {last}".strip() or "Unknown"
        return {
            "id": l["id"],
            "name": name,
            "company": props.get("company", "") or "",
            "status": props.get("hs_lead_status", "NEW") or "NEW",
            "touches": int(props.get("num_contacted_notes", 0) or 0),
            "lastContact": (props.get("notes_last_contacted") or "")[:10] or None,
            "created": (props.get("createdate") or "")[:10],
        }

    leads_js = json.dumps([lead_js_obj(l) for l in leads_list], indent=2)

    # ─────────────────────────────────────────────
    # HTML TEMPLATE
    # ─────────────────────────────────────────────
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sales Command Center</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {{
    --white: #ffffff; --off-white: #f8f7f4; --light-gray: #f1f0ed;
    --mid-gray: #e5e3de; --border: #dddbd5; --text-primary: #1a1916;
    --text-secondary: #6b6860; --text-muted: #9e9b94; --accent: #2563d4;
    --accent-light: #eff4ff; --accent-mid: #bfcfef; --success: #16a34a;
    --success-light: #f0fdf4; --warning: #d97706; --warning-light: #fffbeb;
    --danger: #dc2626; --danger-light: #fef2f2; --purple: #7c3aed; --purple-light: #f5f3ff;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: 'DM Sans', sans-serif; background: var(--off-white); color: var(--text-primary); font-size: 14px; line-height: 1.5; }}
  .header {{ background: var(--white); border-bottom: 1px solid var(--border); padding: 20px 32px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; box-shadow: 0 1px 8px rgba(0,0,0,0.04); }}
  .header-left h1 {{ font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.3px; }}
  .header-left p {{ font-size: 12px; color: var(--text-muted); font-weight: 400; margin-top: 1px; }}
  .header-date {{ font-family: 'DM Mono', monospace; font-size: 12px; color: var(--text-secondary); background: var(--light-gray); padding: 6px 12px; border-radius: 6px; }}
  .tabs {{ background: var(--white); border-bottom: 1px solid var(--border); padding: 0 32px; display: flex; gap: 0; }}
  .tab {{ padding: 14px 20px; font-size: 13px; font-weight: 500; color: var(--text-secondary); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; white-space: nowrap; }}
  .tab:hover {{ color: var(--text-primary); }}
  .tab.active {{ color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }}
  .content {{ padding: 28px 32px; max-width: 1600px; margin: 0 auto; }}
  .section {{ display: none; }}
  .section.active {{ display: block; }}
  .kpi-row {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 24px; }}
  .kpi-card {{ background: var(--white); border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px; position: relative; overflow: hidden; }}
  .kpi-card::before {{ content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--accent); border-radius: 10px 10px 0 0; }}
  .kpi-card.green::before {{ background: var(--success); }}
  .kpi-card.orange::before {{ background: var(--warning); }}
  .kpi-card.red::before {{ background: var(--danger); }}
  .kpi-card.purple::before {{ background: var(--purple); }}
  .kpi-label {{ font-size: 11px; color: var(--text-muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }}
  .kpi-value {{ font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 700; color: var(--text-primary); margin-top: 4px; line-height: 1; }}
  .kpi-sub {{ font-size: 11px; color: var(--text-secondary); margin-top: 4px; }}
  .panel {{ background: var(--white); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 20px; overflow: hidden; }}
  .panel-header {{ padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }}
  .panel-title {{ font-size: 13px; font-weight: 600; color: var(--text-primary); letter-spacing: -0.1px; }}
  .panel-sub {{ font-size: 11px; color: var(--text-muted); margin-top: 1px; }}
  .table-wrap {{ overflow-x: auto; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
  th {{ background: var(--off-white); padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid var(--border); white-space: nowrap; }}
  td {{ padding: 11px 14px; border-bottom: 1px solid var(--light-gray); vertical-align: top; }}
  tr:last-child td {{ border-bottom: none; }}
  tr:hover td {{ background: var(--off-white); }}
  .deal-link {{ color: var(--accent); text-decoration: none; font-weight: 500; }}
  .deal-link:hover {{ text-decoration: underline; }}
  .badge {{ display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; white-space: nowrap; }}
  .badge-blue {{ background: var(--accent-light); color: var(--accent); }}
  .badge-green {{ background: var(--success-light); color: var(--success); }}
  .badge-orange {{ background: var(--warning-light); color: var(--warning); }}
  .badge-red {{ background: var(--danger-light); color: var(--danger); }}
  .badge-purple {{ background: var(--purple-light); color: var(--purple); }}
  .badge-gray {{ background: var(--light-gray); color: var(--text-secondary); }}
  .risk-flag {{ display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-family: 'DM Mono', monospace; }}
  .risk-red {{ color: var(--danger); }} .risk-orange {{ color: var(--warning); }} .risk-green {{ color: var(--success); }}
  .insight-block {{ background: var(--off-white); border-left: 3px solid var(--accent); padding: 8px 12px; border-radius: 0 6px 6px 0; font-size: 12px; color: var(--text-secondary); line-height: 1.5; margin-top: 4px; max-width: 320px; }}
  .insight-block.warn {{ border-left-color: var(--warning); }}
  .insight-block.danger {{ border-left-color: var(--danger); }}
  .chart-container {{ padding: 20px; }}
  .bar-chart {{ display: flex; flex-direction: column; gap: 10px; }}
  .bar-row {{ display: flex; align-items: center; gap: 12px; }}
  .bar-label {{ font-size: 12px; color: var(--text-secondary); width: 90px; text-align: right; flex-shrink: 0; }}
  .bar-track {{ flex: 1; background: var(--light-gray); border-radius: 4px; height: 28px; position: relative; overflow: hidden; }}
  .bar-fill {{ height: 100%; border-radius: 4px; background: var(--accent); display: flex; align-items: center; padding: 0 10px; transition: width 0.5s ease; min-width: 40px; }}
  .bar-fill.green {{ background: var(--success); }} .bar-fill.orange {{ background: var(--warning); }}
  .bar-fill span {{ font-size: 11px; font-weight: 600; color: white; font-family: 'DM Mono', monospace; }}
  .bar-amount {{ font-size: 12px; color: var(--text-muted); width: 80px; font-family: 'DM Mono', monospace; flex-shrink: 0; }}
  .grid-2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }}
  @media (max-width: 900px) {{ .grid-2 {{ grid-template-columns: 1fr; }} }}
  .priority-alert {{ background: linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%); border: 1px solid #fcd34d; border-radius: 10px; padding: 16px 20px; margin-bottom: 20px; }}
  .priority-alert h3 {{ font-size: 13px; font-weight: 600; color: #92400e; margin-bottom: 8px; }}
  .priority-item {{ font-size: 12px; color: #78350f; padding: 4px 0; display: flex; align-items: center; gap: 8px; }}
  .priority-item::before {{ content: '⚡'; }}
  .filter-row {{ display: flex; gap: 10px; padding: 12px 20px; border-bottom: 1px solid var(--border); flex-wrap: wrap; align-items: center; }}
  .filter-select {{ padding: 7px 10px; border: 1px solid var(--border); border-radius: 6px; font-family: 'DM Sans', sans-serif; font-size: 12px; background: var(--white); color: var(--text-secondary); cursor: pointer; }}
  .search-box {{ padding: 8px 16px; border: 1px solid var(--border); border-radius: 7px; font-family: 'DM Sans', sans-serif; font-size: 13px; background: var(--white); color: var(--text-primary); width: 240px; }}
  .search-box:focus {{ outline: none; border-color: var(--accent); }}
  .pagination {{ padding: 12px 20px; display: flex; align-items: center; gap: 8px; border-top: 1px solid var(--border); }}
  .pagination-info {{ font-size: 12px; color: var(--text-muted); flex: 1; }}
  .pagination-btn {{ padding: 5px 10px; border: 1px solid var(--border); border-radius: 5px; background: var(--white); cursor: pointer; font-size: 12px; color: var(--text-secondary); }}
  .pagination-btn:hover:not(:disabled) {{ border-color: var(--accent); color: var(--accent); }}
  .pagination-btn:disabled {{ opacity: 0.4; cursor: default; }}
  .touches-bar {{ display: flex; align-items: center; gap: 6px; }}
  .touches-dots {{ display: flex; gap: 2px; }}
  .touch-dot {{ width: 8px; height: 8px; border-radius: 50%; background: var(--border); }}
  .touch-dot.filled {{ background: var(--accent); }}
  .touch-dot.done {{ background: var(--success); }}
  .sdr-metrics {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; padding: 16px 20px; }}
  .sdr-metric {{ text-align: center; }}
  .sdr-metric-value {{ font-family: 'Playfair Display', serif; font-size: 32px; font-weight: 700; line-height: 1; }}
  .sdr-metric-label {{ font-size: 11px; color: var(--text-muted); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.4px; }}
  .outcome-bars {{ padding: 16px 20px; }}
  .outcome-row {{ display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }}
  .outcome-label {{ font-size: 12px; color: var(--text-secondary); width: 200px; flex-shrink: 0; }}
  .outcome-bar {{ flex: 1; background: var(--light-gray); border-radius: 3px; height: 20px; overflow: hidden; }}
  .outcome-fill {{ height: 100%; border-radius: 3px; display: flex; align-items: center; padding: 0 8px; }}
  .outcome-fill span {{ font-size: 11px; font-weight: 600; color: white; font-family: 'DM Mono', monospace; }}
  .outcome-pct {{ font-size: 11px; font-family: 'DM Mono', monospace; color: var(--text-muted); width: 40px; }}
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <h1>Sales Command Center</h1>
    <p>Live data from HubSpot · Ryan McQuillan · Auto-refreshed daily</p>
  </div>
  <div class="header-date">{today}</div>
</div>

<div class="tabs">
  <div class="tab active" onclick="switchTab('loop', this)">Loop ERP Pipeline</div>
  <div class="tab" onclick="switchTab('ceba', this)">CEBA Pipeline</div>
  <div class="tab" onclick="switchTab('sdr', this)">SDR Activities</div>
  <div class="tab" onclick="switchTab('leads', this)">Lead Dashboard</div>
</div>

<!-- ===== LOOP ERP ===== -->
<div id="tab-loop" class="section active content">
  <div class="kpi-row">
    <div class="kpi-card blue">
      <div class="kpi-label">Total Pipeline</div>
      <div class="kpi-value">{fmt_currency(loop_total)}</div>
      <div class="kpi-sub">{loop_count} open deals</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-label">Weighted Value</div>
      <div class="kpi-value">{fmt_currency(loop_weighted)}</div>
      <div class="kpi-sub">Probability-adjusted</div>
    </div>
    <div class="kpi-card red">
      <div class="kpi-label">Avg Deal Size</div>
      <div class="kpi-value">{fmt_currency(loop_total / loop_count if loop_count else 0)}</div>
      <div class="kpi-sub">Per open deal</div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-header">
      <div>
        <div class="panel-title">Open Deals — Full Pipeline View</div>
        <div class="panel-sub">Notes &amp; activity insights · Click deal name to open in HubSpot</div>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Deal Name</th><th>Stage</th><th>Amount</th><th>Weighted</th>
            <th>Close Date</th><th>Days in Stage</th><th>Last Contact</th>
            <th>Notes</th><th>Notion</th><th>Insight</th>
          </tr>
        </thead>
        <tbody>
{loop_rows}
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- ===== CEBA ===== -->
<div id="tab-ceba" class="section content" style="display:none">
  <div class="kpi-row">
    <div class="kpi-card blue">
      <div class="kpi-label">Open Pipeline</div>
      <div class="kpi-value">{fmt_currency(ceba_open_val)}</div>
      <div class="kpi-sub">{len(ceba_deals)} active deals</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-label">Closed Won (All Time)</div>
      <div class="kpi-value">{fmt_currency(ceba_won_val)}</div>
      <div class="kpi-sub">Historical wins</div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-header">
      <div>
        <div class="panel-title">Open CEBA Deals</div>
        <div class="panel-sub">Click deal name to open in HubSpot</div>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Deal Name</th><th>Stage</th><th>Amount</th><th>Weighted</th>
            <th>Close Date</th><th>Days in Stage</th><th>Last Contact</th>
            <th>Notes</th><th>Notion</th><th>Insight</th>
          </tr>
        </thead>
        <tbody>
{ceba_rows}
        </tbody>
      </table>
    </div>
  </div>

  <div class="panel">
    <div class="panel-header"><div class="panel-title">All CEBA Deals (Historical)</div></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Deal Name</th><th>Status</th><th>Amount</th><th>Close Date</th><th>Link</th></tr></thead>
        <tbody>
{ceba_history_rows}
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- ===== SDR ===== -->
<div id="tab-sdr" class="section content" style="display:none">
  <div class="kpi-row">
    <div class="kpi-card blue">
      <div class="kpi-label">Total Calls (All Time)</div>
      <div class="kpi-value">{sdr_calls:,}</div>
      <div class="kpi-sub">Caleb Wilton · All logged</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-label">Daily Target</div>
      <div class="kpi-value">75</div>
      <div class="kpi-sub">Calls per day</div>
    </div>
    <div class="kpi-card orange">
      <div class="kpi-label">Weekly Appt Target</div>
      <div class="kpi-value">5</div>
      <div class="kpi-sub">SDR → Sales appointments</div>
    </div>
    <div class="kpi-card purple">
      <div class="kpi-label">Connect Rate</div>
      <div class="kpi-value">~11%</div>
      <div class="kpi-sub">Connected calls / total dials</div>
    </div>
  </div>
  <div class="panel">
    <div class="panel-header"><div class="panel-title">SDR Notes</div></div>
    <div style="padding:16px 20px;font-size:13px;color:var(--text-secondary)">
      Call volume and outcome breakdown are pulled from HubSpot activities.
      Check HubSpot directly for the most detailed daily breakdown and appointment logging.
    </div>
  </div>
</div>

<!-- ===== LEADS ===== -->
<div id="tab-leads" class="section content" style="display:none">
  <div class="kpi-row">
    <div class="kpi-card blue">
      <div class="kpi-label">Total Leads</div>
      <div class="kpi-value">{leads_total}</div>
      <div class="kpi-sub">lifecyclestage = lead</div>
    </div>
    <div class="kpi-card red">
      <div class="kpi-label">NEW</div>
      <div class="kpi-value">{leads_counts.get("NEW", 0)}</div>
      <div class="kpi-sub">Need outreach</div>
    </div>
    <div class="kpi-card orange">
      <div class="kpi-label">OPEN</div>
      <div class="kpi-value">{leads_counts.get("OPEN", 0)}</div>
      <div class="kpi-sub">In-progress leads</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-label">CONNECTED</div>
      <div class="kpi-value">{leads_counts.get("CONNECTED", 0)}</div>
      <div class="kpi-sub">Engaged</div>
    </div>
    <div class="kpi-card purple">
      <div class="kpi-label">0 Touches</div>
      <div class="kpi-value">{leads_counts.get("ZERO_TOUCHES", 0)}</div>
      <div class="kpi-sub">Never contacted</div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-header">
      <div>
        <div class="panel-title">All Lead Records ({leads_total} total)</div>
        <div class="panel-sub">Click name to open in HubSpot · Sorted by most recent</div>
      </div>
    </div>
    <div class="filter-row">
      <input type="text" class="search-box" id="leadSearch" placeholder="Search leads..." oninput="filterLeads()">
      <select class="filter-select" id="leadStatusFilter" onchange="filterLeads()">
        <option value="">All Statuses</option>
        <option value="NEW">NEW</option>
        <option value="OPEN">OPEN</option>
        <option value="CONNECTED">CONNECTED</option>
        <option value="IN_PROGRESS">IN_PROGRESS</option>
        <option value="BAD_TIMING">BAD_TIMING</option>
      </select>
      <select class="filter-select" id="leadTouchFilter" onchange="filterLeads()">
        <option value="">All Touch Counts</option>
        <option value="0">0 touches (never contacted)</option>
        <option value="1-3">1–3 touches</option>
        <option value="4-6">4–6 touches</option>
        <option value="7+">7+ touches</option>
      </select>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th><th>Name</th><th>Company</th><th>Status</th><th>Touches</th>
            <th>Last Contact</th><th>Created</th><th>7-Touch Progress</th><th>Link</th>
          </tr>
        </thead>
        <tbody id="leadsTableBody"></tbody>
      </table>
    </div>
    <div class="pagination" id="leadsPagination">
      <span class="pagination-info" id="paginationInfo"></span>
      <button class="pagination-btn" id="prevBtn" onclick="changePage(-1)">← Prev</button>
      <span id="pageIndicator" style="font-size:12px;color:var(--text-secondary)"></span>
      <button class="pagination-btn" id="nextBtn" onclick="changePage(1)">Next →</button>
    </div>
  </div>
</div>

<script>
function switchTab(tab, el) {{
  document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab).style.display = 'block';
  el.classList.add('active');
  if (tab === 'leads') renderLeads();
}}

// ── Leads ──
const allLeads = {leads_js};

let currentPage = 1;
const pageSize = 25;
let filteredLeads = [...allLeads];

function getStatusBadgeClass(s) {{
  return {{NEW:'badge-gray',OPEN:'badge-blue',IN_PROGRESS:'badge-orange',CONNECTED:'badge-green',BAD_TIMING:'badge-red',ATTEMPTED_TO_CONTACT:'badge-orange'}}[s] || 'badge-gray';
}}

function getTouchProgressHTML(touches) {{
  const max = 7, filled = Math.min(touches, max), isDone = touches >= max;
  let dots = '';
  for (let i = 0; i < max; i++) dots += `<div class="touch-dot ${{i < filled ? (isDone ? 'done' : 'filled') : ''}}"></div>`;
  return `<div class="touches-bar"><div class="touches-dots">${{dots}}</div><span style="font-size:11px;font-family:'DM Mono',monospace;color:var(--text-muted)">${{touches}}/7</span></div>`;
}}

function filterLeads() {{
  const search = document.getElementById('leadSearch').value.toLowerCase();
  const status = document.getElementById('leadStatusFilter').value;
  const touch  = document.getElementById('leadTouchFilter').value;
  filteredLeads = allLeads.filter(l => {{
    const nameMatch = l.name.toLowerCase().includes(search) || l.company.toLowerCase().includes(search);
    const statusMatch = !status || l.status === status;
    let touchMatch = true;
    if (touch === '0') touchMatch = l.touches === 0;
    else if (touch === '1-3') touchMatch = l.touches >= 1 && l.touches <= 3;
    else if (touch === '4-6') touchMatch = l.touches >= 4 && l.touches <= 6;
    else if (touch === '7+') touchMatch = l.touches >= 7;
    return nameMatch && statusMatch && touchMatch;
  }});
  currentPage = 1;
  renderLeadsTable();
}}

function changePage(dir) {{
  const total = Math.ceil(filteredLeads.length / pageSize);
  currentPage = Math.max(1, Math.min(total, currentPage + dir));
  renderLeadsTable();
}}

function renderLeadsTable() {{
  const start = (currentPage - 1) * pageSize;
  const page  = filteredLeads.slice(start, start + pageSize);
  const total = Math.ceil(filteredLeads.length / pageSize);
  document.getElementById('leadsTableBody').innerHTML = page.map((l, i) => `
    <tr>
      <td style="color:var(--text-muted);font-family:'DM Mono',monospace;font-size:11px">${{start + i + 1}}</td>
      <td><a class="deal-link" href="https://app.hubspot.com/contacts/{PORTAL_ID}/record/0-1/${{l.id}}" target="_blank">${{l.name}}</a></td>
      <td style="color:var(--text-secondary);font-size:12px">${{l.company || '—'}}</td>
      <td><span class="badge ${{getStatusBadgeClass(l.status)}}">${{l.status}}</span></td>
      <td><span style="font-family:'DM Mono',monospace;font-size:12px;font-weight:600;color:${{l.touches===0?'var(--danger)':l.touches>=7?'var(--success)':'var(--text-primary)'}}">
        ${{l.touches}}</span></td>
      <td style="font-size:12px;color:var(--text-secondary)">${{l.lastContact || '<span style=\\"color:var(--danger)\\">Never</span>'}}</td>
      <td style="font-size:12px;color:var(--text-muted)">${{l.created}}</td>
      <td>${{getTouchProgressHTML(l.touches)}}</td>
      <td><a class="deal-link" href="https://app.hubspot.com/contacts/{PORTAL_ID}/record/0-1/${{l.id}}" target="_blank">Open →</a></td>
    </tr>`).join('');
  document.getElementById('paginationInfo').textContent = `Showing ${{start+1}}–${{Math.min(start+pageSize, filteredLeads.length)}} of ${{filteredLeads.length}} leads`;
  document.getElementById('pageIndicator').textContent = `Page ${{currentPage}} of ${{total}}`;
  document.getElementById('prevBtn').disabled = currentPage === 1;
  document.getElementById('nextBtn').disabled = currentPage === total;
}}

function renderLeads() {{ filteredLeads = [...allLeads]; renderLeadsTable(); }}
</script>
</body>
</html>"""

    return html

# ─────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────
if __name__ == "__main__":
    if HUBSPOT_TOKEN == "YOUR_HUBSPOT_TOKEN_HERE":
        print("ERROR: Set your HUBSPOT_TOKEN at the top of this script before running.")
        exit(1)

    print(f"Sales Command Center — Daily Rebuild")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    html = build_dashboard()

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(html)

    size_kb = os.path.getsize(OUTPUT_PATH) // 1024
    print(f"✅ Dashboard saved to: {OUTPUT_PATH} ({size_kb} KB)")
    print(f"Finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
