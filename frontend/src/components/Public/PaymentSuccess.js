import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";

const TZ = "America/New_York";

// ----- helpers -----
function toLocalDate(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm, ss = "00"] = timeStr.split(":");
  const dt = new Date(y, (m || 1) - 1, d || 1, Number(hh || 0), Number(mm || 0), Number(ss || 0));
  return isNaN(dt.getTime()) ? null : dt;
}
function fmtDate(dt) {
  if (!dt) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(dt);
}
function fmtTime(dt) {
  if (!dt) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(dt);
}
function parsePriceFromTitle(title) {
  if (typeof title !== "string") return 0;
  const m = title.match(/\$(\d+(?:\.\d{1,2})?)/);
  return m ? Number(m[1]) : 0;
}
// Compute Square gross (base + 2.9% + $0.30) in **cents** then convert to dollars
function squareGrossFromBase(base) {
  const baseCents = Math.round(Number(base || 0) * 100);
  if (!Number.isFinite(baseCents) || baseCents <= 0) return 0;
  const feePct = Math.round(baseCents * 0.029); // 2.9% fee in cents
  const feeFixed = 30;                           // $0.30 in cents
  const grossCents = baseCents + feePct + feeFixed;
  return Number((grossCents / 100).toFixed(2));
}

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("finalizing"); // finalizing | success | error
  const [errorMsg, setErrorMsg] = useState("");
  const [appointmentSummary, setAppointmentSummary] = useState(null);
  const [debugInfo, setDebugInfo] = useState(null);

  const qp = useMemo(() => {
    const get = (k, def = "") => searchParams.get(k) ?? def;
    const title = get("title");
    const client_name = get("client_name");
    const client_email = get("client_email");
    const client_phone = get("client_phone");
    const date = get("date");
    const time = get("time");
    const end_time = get("end_time") || time;

    // If price is absent, we’ll parse from title below.
    const price = Number(get("price") || 0);

    // Optional Square identifiers
    const paymentLinkId = get("paymentLinkId");
    const checkoutId = get("checkoutId");

    return {
      title,
      client_name,
      client_email,
      client_phone,
      date,
      time,
      end_time,
      price,
      paymentLinkId,
      checkoutId,
    };
  }, [searchParams]);

  useEffect(() => {
    const api = process.env.REACT_APP_API_URL;
    if (!api) {
      setStatus("error");
      setErrorMsg("Missing REACT_APP_API_URL.");
      setDebugInfo({ qp });
      return;
    }

    // Determine base price: prefer qp.price, otherwise parse from title
    const basePrice = qp.price > 0 ? qp.price : parsePriceFromTitle(qp.title);
    const gross = squareGrossFromBase(basePrice);

    // Build a stable dedupe key to prevent double-posts
    const onceKey = [qp.client_email || "", qp.date || "", qp.time || "", qp.title || ""].join("|");

    // Prepare UI preview values early (used if we skip posting)
    const startDt = toLocalDate(qp.date, qp.time);
    const endDt = toLocalDate(qp.date, qp.end_time);
    const previewSummary = {
      id: null,
      title: qp.title,
      whenDate: fmtDate(startDt),
      whenTimeRange:
        startDt && endDt ? `${fmtTime(startDt)} – ${fmtTime(endDt)} ${TZ.replace("_", " ")}` : "",
      amountRecorded: `$${gross.toFixed(2)}`,
    };

    // If we already posted this exact booking in this browser session, don't post again.
    if (sessionStorage.getItem(`posted:${onceKey}`) === "1") {
      setAppointmentSummary(previewSummary);
      setStatus("success");
      setDebugInfo((d) => ({
        ...(d || {}),
        dedup: "Skipped re-post (sessionStorage guard)",
        qp,
        computed: { basePrice, gross },
      }));
      return;
    }

    const finalize = async () => {
      // Optional: verify with your backend if you pass checkout/payment IDs
      let squareVerify = null;
      try {
        const id = qp.checkoutId || qp.paymentLinkId;
        if (id) {
          const v = await fetch(`${api}/api/square-confirm/${encodeURIComponent(id)}`);
          if (v.ok) squareVerify = await v.json();
        }
      } catch (e) {
        squareVerify = { warning: "Square verification skipped or failed", error: String(e) };
      }

      // Validate minimum fields
      if (!qp.title || !qp.client_name || !qp.client_email || !qp.date || !qp.time || !qp.end_time) {
        setStatus("error");
        setErrorMsg("Missing required appointment data in the redirect URL.");
        setDebugInfo({ qp, squareVerify, computed: { basePrice, gross } });
        return;
      }

      // Build payload for backend: amount_paid = computed Square gross
      const appointmentData = {
        title: qp.title,
        client_name: qp.client_name,
        client_email: qp.client_email,
        client_phone: qp.client_phone,
        date: qp.date,
        time: qp.time,
        end_time: qp.end_time,
        description: "Paid via Square",
        payment_method: "Square",
        amount_paid: gross,                // <-- key: fee-inclusive total
        price: basePrice > 0 ? basePrice : undefined, // store the base if you want
      };

      try {
        const resp = await fetch(`${api}/appointments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(appointmentData),
        });

        // Accept 200 (duplicate/idempotent) or 201 (new)
        if (!resp.ok && resp.status !== 200) {
          const t = await resp.text().catch(() => "");
          throw new Error(t || "Failed to create appointment");
        }

        const data = await resp.json().catch(() => ({}));

        // Prevent re-posts on refresh
        sessionStorage.setItem(`posted:${onceKey}`, "1");

        const created = Array.isArray(data?.appointments) && data.appointments.length
          ? data.appointments[0]
          : data?.appointment || data;

        setAppointmentSummary({
          id: created?.id ?? null,
          ...previewSummary,
        });

        setDebugInfo({
          qp,
          computed: { basePrice, gross },
          squareVerify,
          apiResponse: data,
          postedPayload: appointmentData,
        });

        setStatus("success");
      } catch (err) {
        setStatus("error");
        setErrorMsg(err?.message || "Something went wrong finalizing your appointment.");
        setDebugInfo({
          qp,
          computed: { basePrice, gross },
          error: String(err),
        });
      }
    };

    finalize();
  }, [qp]);

  if (status === "finalizing") {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h2>⏳ Finalizing your appointment…</h2>
        <p>Please don’t close this tab.</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h2>❌ Something went wrong finalizing your appointment.</h2>
        {errorMsg && <p style={{ marginTop: 8 }}>{errorMsg}</p>}
        <details style={{ marginTop: 16, textAlign: "left", maxWidth: 720, marginInline: "auto" }}>
          <summary>Debug</summary>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </details>
        <div style={{ marginTop: 24 }}>
          <Link to="/">Back to Portal</Link>
        </div>
      </div>
    );
  }

  // success
  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <h2>✅ You’re all set!</h2>
      <p>Appointment Confirmed.</p>

      <div
        style={{
          margin: "24px auto",
          textAlign: "left",
          maxWidth: 720,
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 16,
        }}
      >
        {appointmentSummary?.id && (
          <p>
            <strong>Appointment ID:</strong> {appointmentSummary.id}
          </p>
        )}
        <p>
          <strong>What:</strong> {appointmentSummary?.title}
        </p>
        <p>
          <strong>When:</strong>{" "}
          {appointmentSummary?.whenDate} {appointmentSummary?.whenTimeRange ? "•" : ""}
          {appointmentSummary?.whenTimeRange}
        </p>
        <p>
          <strong>Amount recorded:</strong> {appointmentSummary?.amountRecorded}
        </p>
      </div>

      <details style={{ marginTop: 8, textAlign: "left", maxWidth: 720, marginInline: "auto" }}>
        <summary>Show debug</summary>
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {JSON.stringify(debugInfo, null, 2)}
        </pre>
      </details>

      <div style={{ marginTop: 24 }}>
        <Link to="/">Back to Portal</Link>
      </div>
    </div>
  );
}
