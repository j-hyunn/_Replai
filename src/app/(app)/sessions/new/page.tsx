"use client";

import { AlertTriangle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { BlockedNotice } from "@/components/common/blocked-notice";
import { ConfirmCancelDialog } from "@/components/common/confirm-cancel-dialog";
import { ErrorState, LoadingCard, NotFoundState } from "@/components/common/states";
import {
  JobRoleRadioGroup,
  ModalityRadioGroup,
  PersonaPicker,
} from "@/components/session/config-pickers";
import { DocumentPicker } from "@/components/session/document-picker";
import { TrialConsentDialog } from "@/components/session/trial-consent-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useCapacity, useGrantTrialConsent } from "@/hooks/use-account";
import { useDocuments } from "@/hooks/use-documents";
import {
  useAbandonPreparation,
  useCancelSession,
  useCreateSession,
  usePrepareSession,
  useUpdateSessionConfig,
} from "@/hooks/use-session-mutations";
import { useSession } from "@/hooks/use-sessions";
import { isApiClientError } from "@/lib/api/fetch-json";
import type { Document, Session, SessionConfigPatch } from "@/lib/api/types";
import { blockedCodeFor, type BlockedCode } from "@/lib/blocked/blocked-copy";
import { routeForStatus } from "@/lib/session/route-for-status";

/**
 * `/sessions/new` — 세션 설정 (06_ui_plan.md 4.4절).
 *
 * 세션 행은 **마운트 시 즉시** `created`로 만듭니다 — `PATCH .../config`(#5)가 세션 id를
 * 요구하고 부분 저장이 정상 경로이기 때문입니다. 그 대가로 남는 빈 세션의 정리 수단은
 * **"이 면접 그만두기"(#33 `useCancelSession`)** 이며, `useDeleteSession`이 아닙니다(D19).
 */
export default function NewSessionPage() {
  // `useSearchParams()`는 Suspense 경계가 필요합니다 — 없으면 프리렌더가 실패합니다.
  return (
    <Suspense
      fallback={
        <main id="main" className="mx-auto w-full max-w-3xl px-4 py-8">
          <LoadingCard lines={4} />
        </main>
      }
    >
      <NewSessionFlow />
    </Suspense>
  );
}

function NewSessionFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");

  const createSession = useCreateSession();
  const createdRef = useRef(false);

  // `?sessionId=`가 없으면 새로 만들고 URL을 교체합니다. StrictMode의 이중 실행으로
  // 빈 세션이 두 개 생기지 않도록 ref로 한 번만 통과시킵니다.
  useEffect(() => {
    if (sessionId || createdRef.current) return;
    createdRef.current = true;
    createSession.mutate(
      {},
      {
        onSuccess: (session) =>
          router.replace(`/sessions/new?sessionId=${session.id}`),
        onError: () => {
          // 503 `capacity_unavailable`은 세션 자체가 없으므로 안내만 띄웁니다.
          createdRef.current = false;
        },
      },
    );
  }, [createSession, router, sessionId]);

  if (!sessionId) {
    return (
      <main id="main" className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">새 면접 준비</h1>
        {createSession.isError ? (
          <CreateBlocked error={createSession.error} />
        ) : (
          <LoadingCard />
        )}
      </main>
    );
  }

  return <SessionConfigForm sessionId={sessionId} />;
}

function CreateBlocked({ error }: { error: unknown }) {
  const capacity = useCapacity();
  const code = isApiClientError(error) ? error.code : "internal_error";

  if (code === "capacity_unavailable" || code === "byok_key_invalid") {
    return (
      <BlockedNotice
        code={blockedCodeFor(code, capacity.data?.keyStatus)}
        returnTo="/sessions/new"
        availableAtIso={capacity.data?.availableAtIso ?? null}
      />
    );
  }
  return <ErrorState error={error} />;
}

function SessionConfigForm({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const capacity = useCapacity();
  const updateConfig = useUpdateSessionConfig(sessionId);
  const prepare = usePrepareSession(sessionId);
  const abandon = useAbandonPreparation(sessionId);
  const cancelSession = useCancelSession();
  const grantConsent = useGrantTrialConsent();

  const [consentOpen, setConsentOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [blocked, setBlocked] = useState<BlockedCode | null>(null);
  const [reservationSessionId, setReservationSessionId] = useState<string | null>(null);

  // 준비 중에는 3초 간격으로 폴링합니다. Realtime도 함께 걸어 두면 둘 중 먼저 오는 쪽이 이깁니다.
  const preparing = prepare.isSuccess || prepare.isPending;
  const session = useSession(sessionId, {
    refetchInterval: preparing ? 3_000 : false,
  });

  const resumeDocs = useDocuments({ docType: "resume" });
  const jdDocs = useDocuments({ docType: "job_description" });

  const data = session.data;

  // 상태가 자기 것이 아니면 `route-for-status()`로 보냅니다 — 이것이 딥링크·뒤로가기·
  // Realtime 전이 세 경로의 유일한 분기입니다.
  useEffect(() => {
    if (!data) return;
    if (data.status === "created" || data.status === "configuring") return;
    router.replace(routeForStatus(data.status, data.id));
  }, [data, router]);

  if (session.isPending) {
    return (
      <main id="main" className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8">
        <LoadingCard lines={4} />
        <LoadingCard lines={4} />
      </main>
    );
  }

  if (session.isError) {
    const notFound = isApiClientError(session.error) && session.error.status === 404;
    return (
      <main id="main" className="mx-auto w-full max-w-3xl px-4 py-8">
        {notFound ? (
          <NotFoundState />
        ) : (
          <ErrorState error={session.error} onRetry={() => void session.refetch()} />
        )}
      </main>
    );
  }

  const current = session.data;
  const resumeDoc = findDocument(resumeDocs.data?.documents, current.resumeDocumentId);
  const jdDoc = findDocument(jdDocs.data?.documents, current.jdDocumentId);

  const missing = missingRequirements(current, resumeDoc, jdDoc);
  const canPrepare = missing.length === 0;
  const extractionFailed =
    resumeDoc?.extractionStatus === "failed" || jdDoc?.extractionStatus === "failed";

  function patch(next: SessionConfigPatch) {
    updateConfig.mutate(next, {
      onError: (error) => toast.error(error.message),
    });
  }

  function runPrepare() {
    prepare.mutate(undefined, {
      onError: (error) => {
        if (!isApiClientError(error)) {
          toast.error("요청을 처리하지 못했습니다.");
          return;
        }
        // **소거법 금지** — 언제나 `error.code`의 switch이며, 모르는 code는
        // D30이 아니라 일반 오류 안내로 떨어집니다(계약 13절).
        switch (error.code) {
          case "trial_consent_required":
            void capacity.refetch();
            setConsentOpen(true);
            break;
          case "trial_reservation_exists": {
            const existing = error.details?.existingSessionId;
            // 목적지는 `details.existingSessionId` 하나뿐입니다. 없으면 링크를 만들지 않습니다 —
            // 추측으로 고른 세션은 사용자를 엉뚱한 면접으로 보냅니다.
            setReservationSessionId(typeof existing === "string" ? existing : null);
            break;
          }
          case "byok_key_invalid":
            setBlocked("byok_key_invalid");
            break;
          case "capacity_unavailable":
            setBlocked(blockedCodeFor(error.code, capacity.data?.keyStatus));
            break;
          default:
            toast.error(error.message);
        }
      },
    });
  }

  function handlePrepareClick() {
    // 동의 게이트는 **`usePrepareSession` 직전**입니다 (D29).
    // 조건은 `keyStatus`가 아니라 `nextFundingSource` + `requiresTrialConsent`입니다.
    if (
      capacity.data?.nextFundingSource === "trial_shared" &&
      capacity.data.requiresTrialConsent
    ) {
      setConsentOpen(true);
      return;
    }
    runPrepare();
  }

  const returnTo = `/sessions/new?sessionId=${sessionId}`;

  return (
    <main id="main" className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">면접 설정</h1>
        <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)}>
          이 면접 그만두기
        </Button>
      </div>

      {/* 플래너가 도는 8~20초. `preparation.state`는 새 상태 값 없이 파생된 값입니다(계약 12.2절). */}
      {current.preparation.state === "running" ? (
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="text-sm font-medium">
              이력서와 채용공고를 읽고 첫 질문을 준비하고 있습니다
            </p>
            <Progress />
            <p className="text-sm text-muted-foreground">
              보통 10초에서 20초쯤 걸립니다. 이 화면을 닫지 말고 잠시만 기다려 주세요.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* 플래너 실패는 **상태 전이가 아닙니다.** 세션은 `configuring`에 남습니다. */}
      {current.preparation.state === "failed" ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden />
          <AlertTitle>첫 질문을 준비하지 못했습니다</AlertTitle>
          <AlertDescription>
            <p>설정은 그대로 저장돼 있습니다. 다시 준비를 눌러 주세요.</p>
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={runPrepare}>
                다시 준비
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {blocked ? (
        <BlockedNotice
          code={blocked}
          returnTo={returnTo}
          availableAtIso={capacity.data?.availableAtIso ?? null}
          // #6에서 거절됐으므로 세션은 `configuring`에 남아 있습니다 — 이 줄이 사실입니다.
          configPreserved
        />
      ) : null}

      {reservationSessionId !== null ? (
        <ReservationConflictNotice
          existingSessionId={reservationSessionId}
          onDismiss={() => setReservationSessionId(null)}
          onCancelExisting={() => {
            cancelSession.mutate(reservationSessionId, {
              onSuccess: () => {
                setReservationSessionId(null);
                runPrepare();
              },
              onError: (error) => toast.error(error.message),
            });
          }}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>1. 직군</CardTitle>
        </CardHeader>
        <CardContent>
          <JobRoleRadioGroup
            value={current.jobRole}
            onChange={(jobRole) => patch({ jobRole })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. 면접관 유형</CardTitle>
        </CardHeader>
        <CardContent>
          <PersonaPicker
            value={current.persona}
            onChange={(persona) => patch({ persona })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. 대화 방식</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ModalityRadioGroup
            value={current.modality}
            onChange={(modality) => patch({ modality })}
          />
          {/* 음성 고지 4항목 (`03_voice_pipeline.md` 6.4절 · D16) */}
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>음성은 저장하지 않습니다. 저장되는 것은 텍스트 전사뿐입니다.</li>
            <li>받아쓰기와 음성 합성은 브라우저 기능을 사용합니다.</li>
            <li>텍스트로 언제든 전환할 수 있고, 평가 결과는 같습니다.</li>
            <li>받아쓴 내용이 틀리면 직전 답변을 직접 고칠 수 있습니다.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. 이력서와 채용공고</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <DocumentPicker
            docType="resume"
            label="이력서"
            selectedId={current.resumeDocumentId}
            onSelect={(document: Document) =>
              patch({ resumeDocumentId: document.id })
            }
          />
          <Separator />
          <DocumentPicker
            docType="job_description"
            label="채용공고"
            selectedId={current.jdDocumentId}
            onSelect={(document: Document) => patch({ jdDocumentId: document.id })}
          />
        </CardContent>
      </Card>

      {/* 추출 실패 배너의 탈출구 — **가장 약한 위계**로 둡니다(QA F8). */}
      {extractionFailed ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden />
          <AlertTitle>문서를 읽지 못해 준비를 진행할 수 없습니다</AlertTitle>
          <AlertDescription>
            <p>
              다시 읽기를 시도하거나 텍스트를 직접 입력해 주세요. 어느 쪽도 원하지 않으시면
              이 면접의 준비를 포기할 수 있습니다.
            </p>
            <div className="mt-3">
              <Button
                variant="ghost"
                size="sm"
                disabled={abandon.isPending}
                onClick={() => {
                  abandon.mutate(undefined, {
                    onSuccess: (updated) =>
                      router.replace(routeForStatus(updated.status, updated.id)),
                    onError: (error) => toast.error(error.message),
                  });
                }}
              >
                이 세션 준비 포기
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="space-y-3 py-6">
          {/* 비활성 버튼만 두면 사용자는 왜 못 누르는지 모릅니다 — 무엇이 빠졌는지 나열합니다. */}
          {missing.length > 0 ? (
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>면접을 준비하려면 아래가 필요합니다.</p>
              <ul className="list-disc pl-5">
                {missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <Button
            size="lg"
            disabled={!canPrepare || prepare.isPending || current.preparation.state === "running"}
            onClick={handlePrepareClick}
          >
            면접 준비
          </Button>
        </CardContent>
      </Card>

      <TrialConsentDialog
        open={consentOpen}
        onOpenChange={setConsentOpen}
        pending={grantConsent.isPending}
        returnTo={returnTo}
        onAgree={() => {
          const version = capacity.data?.consentVersion;
          if (!version) {
            // `consentVersion`을 하드코딩하지 않습니다 — 409 `consent_version_stale`이 납니다.
            toast.error("안내 문구를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.");
            return;
          }
          // **낙관적 진행 금지** — 동의가 성공한 뒤에 준비를 부릅니다.
          grantConsent.mutate(
            { consentVersion: version, sessionId },
            {
              onSuccess: () => {
                setConsentOpen(false);
                runPrepare();
              },
              onError: (error) => {
                if (isApiClientError(error) && error.code === "consent_version_stale") {
                  toast.error("안내 문구가 업데이트되었어요. 새로고침 후 다시 확인해 주세요.");
                  return;
                }
                toast.error(
                  isApiClientError(error) ? error.message : "요청을 처리하지 못했습니다.",
                );
              },
            },
          );
        }}
      />

      <ConfirmCancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        pending={cancelSession.isPending}
        onConfirm={() => {
          cancelSession.mutate(sessionId, {
            onSuccess: () => router.replace("/sessions"),
            onError: (error) => toast.error(error.message),
          });
        }}
      />
    </main>
  );
}

function findDocument(
  documents: Document[] | undefined,
  id: string | null,
): Document | null {
  if (!documents || !id) return null;
  return documents.find((item) => item.id === id) ?? null;
}

/**
 * 준비 가드 (06_ui_plan.md 4.4절):
 * 직군·페르소나·모달리티·이력서·JD가 모두 있고 두 문서의 `extractionStatus === 'succeeded'`.
 */
function missingRequirements(
  session: Session,
  resumeDoc: Document | null,
  jdDoc: Document | null,
): string[] {
  const missing: string[] = [];
  if (!session.jobRole) missing.push("직군 선택");
  if (!session.persona) missing.push("면접관 유형 선택");
  if (!session.resumeDocumentId) missing.push("이력서 선택");
  else if (resumeDoc && resumeDoc.extractionStatus !== "succeeded") {
    missing.push("이력서 텍스트 읽기 완료");
  }
  if (!session.jdDocumentId) missing.push("채용공고 선택");
  else if (jdDoc && jdDoc.extractionStatus !== "succeeded") {
    missing.push("채용공고 텍스트 읽기 완료");
  }
  return missing;
}

/**
 * D30 — 체험 사용자는 동시에 하나의 면접만 준비할 수 있습니다.
 *
 * **여력 부족(503) 화면·"내일 오세요" 문구와 섞지 않습니다** — 여력이 남아 있어도 나오는
 * 오류이고, 사용자가 할 일은 키 연결이 아니라 **기존 면접 정리**입니다.
 * 안내 문구에 "예약"이라는 내부 용어를 쓰지 않습니다.
 */
function ReservationConflictNotice({
  existingSessionId,
  onCancelExisting,
  onDismiss,
}: {
  existingSessionId: string | null;
  onCancelExisting: () => void;
  onDismiss: () => void;
}) {
  const existing = useSession(existingSessionId);

  return (
    <Alert>
      <AlertTriangle aria-hidden />
      <AlertTitle>이미 준비 중인 면접이 있습니다</AlertTitle>
      <AlertDescription>
        <p>
          한 번에 하나의 면접만 준비할 수 있어요. 먼저 시작한 면접을 이어서 하거나, 그 면접을
          취소한 뒤 새로 시작해 주세요.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {existingSessionId && existing.data ? (
            <Button asChild size="sm">
              <a href={routeForStatus(existing.data.status, existing.data.id)}>
                이어서 하기
              </a>
            </Button>
          ) : null}
          {existingSessionId ? (
            <Button size="sm" variant="outline" onClick={onCancelExisting}>
              이전 면접 취소하기
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            여기 남기
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
