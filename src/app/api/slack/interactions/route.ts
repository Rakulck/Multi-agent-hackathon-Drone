import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import {
  applyApprovalDecision,
  markMessageUpdateAttempted,
  noteSlackUpdateFailure,
  type SlackApprovalRecord,
} from "@/lib/slack-approval-store";
import { updateSlackApprovalMessage } from "@/services/slack";
import type { ApprovalDecision } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const interactionSchema = z.object({
  type: z.literal("block_actions"),
  user: z.object({
    id: z.string().min(1),
    username: z.string().optional(),
    name: z.string().optional(),
  }),
  actions: z
    .array(
      z.object({
        action_id: z.enum([
          "approve_mission_adjustment",
          "approve_alternate_dropoff",
          "keep_mission_on_hold",
          "reject_mission",
        ]),
        value: z.string().uuid(),
      }),
    )
    .min(1),
});

const decisionByAction: Record<
  z.infer<typeof interactionSchema>["actions"][number]["action_id"],
  ApprovalDecision
> = {
  approve_mission_adjustment: "approve",
  approve_alternate_dropoff: "approve",
  keep_mission_on_hold: "hold",
  reject_mission: "reject",
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verification = verifySlackSignature(request.headers, rawBody);
  if (!verification.ok) {
    return Response.json(
      { state: verification.state, message: verification.message },
      { status: verification.status },
    );
  }

  const encodedPayload = new URLSearchParams(rawBody).get("payload");
  if (!encodedPayload) {
    return Response.json(
      { state: "INVALID_INTERACTION", message: "Slack interaction payload was missing." },
      { status: 400 },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(encodedPayload);
  } catch {
    return Response.json(
      { state: "INVALID_INTERACTION", message: "Slack interaction payload was invalid JSON." },
      { status: 400 },
    );
  }

  const parsed = interactionSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { state: "INVALID_INTERACTION", message: "Slack interaction fields were invalid." },
      { status: 400 },
    );
  }

  const action = parsed.data.actions[0];
  const operatorName =
    parsed.data.user.name ?? parsed.data.user.username ?? parsed.data.user.id;
  const record = applyApprovalDecision(
    action.value,
    decisionByAction[action.action_id],
    operatorName,
  );

  if (!record) {
    return Response.json(
      { state: "APPROVAL_NOT_FOUND", message: "Approval request was not found." },
      { status: 404 },
    );
  }

  scheduleSlackMessageUpdate(record);

  // Slack requires an acknowledgement within three seconds. State is updated
  // synchronously above; the network call that edits the message runs after
  // this empty 200 response has been committed.
  return new Response("", { status: 200 });
}

function verifySlackSignature(
  headers: Headers,
  rawBody: string,
):
  | { ok: true }
  | { ok: false; state: string; message: string; status: number } {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return {
      ok: false,
      state: "MISSING_SIGNING_SECRET",
      message: "SLACK_SIGNING_SECRET is not configured.",
      status: 503,
    };
  }

  const timestamp = headers.get("x-slack-request-timestamp");
  const suppliedSignature = headers.get("x-slack-signature");
  if (!timestamp || !suppliedSignature) {
    return {
      ok: false,
      state: "INVALID_SIGNATURE",
      message: "Slack signature headers were missing.",
      status: 401,
    };
  }

  const timestampSeconds = Number(timestamp);
  if (
    !Number.isInteger(timestampSeconds) ||
    Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 60 * 5
  ) {
    return {
      ok: false,
      state: "INTERACTION_TIMEOUT",
      message: "Slack request timestamp was outside the five-minute verification window.",
      status: 401,
    };
  }

  const expectedSignature = `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex")}`;
  const expected = Buffer.from(expectedSignature);
  const supplied = Buffer.from(suppliedSignature);
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    return {
      ok: false,
      state: "INVALID_SIGNATURE",
      message: "Slack request signature was invalid.",
      status: 401,
    };
  }

  return { ok: true };
}

function scheduleSlackMessageUpdate(record: SlackApprovalRecord) {
  if (!record.slackReference || record.messageUpdateAttempted) return;
  markMessageUpdateAttempted(record.approval.requestId);
  after(async () => {
    try {
      await updateSlackApprovalMessage({
        approval: record.approval,
        reference: record.slackReference!,
        status: record.status,
        operatorName: record.operatorName,
        statusMessage: record.statusMessage,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      noteSlackUpdateFailure(record.approval.requestId, message);
    }
  });
}
