import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";

const TZ = "America/New_York";

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

function squareGrossFromBase(base) {
  const baseCents = Math.round(Number(base || 0) * 100);
  if (!Number.isFinite(baseCents) || baseCents <= 0) return 0;
  const feePct = Math.round(baseCents * 0.029);
  const feeFixed = 30;
  const grossCents = baseCents + feePct + feeFixed;
  return Number((grossCents / 100).toFixed(2));
}

async function safeJson(resp) {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("finalizing"); // finalizing | success | error
  const [errorMsg, setErrorMsg] = useState("");
  const [appointmentSummary, setAppointmentSummary] = useState(null);
  const [debugInfo, setDebugInfo] = useState(null);

  const api = process.env.REACT_APP_API_URL || "http://localhost:3001";

  const qp = useMemo(() => {
    const get = (k, def = "") => searchParams.get(k) ?? def;

    return {
      appointmentId: get("appointmentId"),
      title: get("title"),
      client_name: get("client_name"),
      client_email: get("client_email"),
      client_phone: get("client_phone"),
      date: get("date"),
      time: get("time"),
      end_time: get("end_time") || get("time"),
      price: Number(get("price") || 0),
      paymentLinkId: get("paymentLinkId"),
      checkoutId: get("checkoutId"),
    };
  }, [searchParams]);

  useEffect(() => {
    const finalize = async () => {
      try {
        const basePrice = qp.price > 0 ? qp.price : parsePriceFromTitle(qp.title);
        const gross = squareGrossFromBase(basePrice);

        const startDt = toLocalDate(qp.date, qp.time);
        const endDt = toLocalDate(qp.date, qp.end_time);

        const previewSummary = {
          id: qp.appointmentId || null,
          title: qp.title,
          whenDate: fmtDate(startDt),
          whenTimeRange: startDt && endDt ? `${fmtTime(startDt)} – ${fmtTime(endDt)} ${TZ.replace("_", " ")}` : "",
          amountRecorded: `$${gross.toFixed(2)}`,
        };

        // ✅ If we have an appointmentId, we should UPDATE that appointment (Ready Portal flow)
        if (qp.appointmentId) {
          // 1) Mark paid = true (your backend already has this endpoint in admin)
          const paidResp = await fetch(`${api}/appointments/${encodeURIComponent(qp.appointmentId)}/paid`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paid: true }),
          });

          // 2) Also try to update amount/payment_method (if your PATCH route accepts extra fields)
          // If backend ignores these fields, it won’t break anything.
          const metaResp = await fetch(`${api}/appointments/${encodeURIComponent(qp.appointmentId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: qp.title,
              description: "Paid via Square",
              date: qp.date,
              time: qp.time,
              end_time: qp.end_time,
              payment_method: "Square",
              amount_paid: gross,
              price: basePrice > 0 ? basePrice : 0,
            }),
          });

          setAppointmentSummary(previewSummary);
          setDebugInfo({
            qp,
            computed: { basePrice, gross },
            paidUpdate: { ok: paidResp.ok, status: paidResp.status },
            metaUpdate: { ok: metaResp.ok, status: metaResp.status },
          });

          // Even if metaUpdate fails, paidUpdate likely succeeded; show success.
          if (!paidResp.ok && !metaResp.ok) {
            const t = await paidResp.text().catch(() => "");
            throw new Error(t || "Could not update appointment after payment.");
          }

          setStatus("success");
          return;
        }

        // Fallback: if appointmentId is missing, do what you had before (create appointment)
        if (!qp.title || !qp.client_name || !qp.client_email || !qp.date || !qp.time || !qp.end_time) {
          throw new Error("Missing required appointment data in redirect URL (and no appointmentId).");
        }

        const payload = {
          title: qp.title,
          client_name: qp.client_name,
          client_email: qp.client_email,
          client_phone: qp.client_phone,
          date: qp.date,
          time: qp.time,
          end_time: qp.end_time,
          description: "Paid via Square",
          payment_method: "Square",
          amount_paid: gross,
          price: basePrice > 0 ? basePrice : undefined,
        };

        const resp = await fetch(`${api}/appointments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await safeJson(resp);
        if (!resp.ok && resp.status !== 200) {
          throw new Error((data && JSON.stringify(data)) || "Failed to create appointment");
        }

        setAppointmentSummary(previewSummary);
        setDebugInfo({ qp, computed: { basePrice, gross }, apiResponse: data, postedPayload: payload });
        setStatus("success");
      } catch (err) {
        setStatus("error");
        setErrorMsg(err?.message || "Something went wrong finalizing your appointment.");
        setDebugInfo({ qp, error: String(err) });
      }
    };

    finalize();
  }, [api, qp]);

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
          <strong>When:</strong> {appointmentSummary?.whenDate}{" "}
          {appointmentSummary?.whenTimeRange ? `• ${appointmentSummary.whenTimeRange}` : ""}
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
