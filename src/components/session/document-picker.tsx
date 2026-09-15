"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { ErrorState } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useDocumentUpload } from "@/hooks/use-document-upload";
import {
  useCreateDocument,
  useDocuments,
  useExtractDocument,
} from "@/hooks/use-documents";
import type { DocType, Document } from "@/lib/api/types";
import { EXTRACTION_STATUS_LABEL } from "@/lib/session/labels";
import { cn } from "@/lib/utils";

/**
 * 보관함 / 새로 올리기 / 직접 입력 3탭 (06_ui_plan.md 4.4절).
 *
 * 추출이 `failed`로 끝나면 인라인 오류를 띄우고 **"텍스트 직접 입력" 탭으로 유도**합니다.
 * 스캔 PDF는 MVP에서 실패 처리이므로 이 유도가 1순위 출구입니다.
 * 세션 준비 포기(#35)는 이 컴포넌트가 아니라 **상위 배너**의 일입니다 — 문서는 세션에
 * 종속되지 않고, 한 문서의 실패가 그 문서를 참조하는 모든 세션을 끌고 죽으면 안 됩니다.
 */
export function DocumentPicker({
  docType,
  label,
  selectedId,
  onSelect,
  disabled,
}: {
  docType: DocType;
  label: string;
  selectedId: string | null;
  onSelect: (document: Document) => void;
  disabled?: boolean;
}) {
  const documents = useDocuments({ docType });
  const createDocument = useCreateDocument();
  const extractDocument = useExtractDocument();
  const upload = useDocumentUpload();

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");

  const items = documents.data?.documents ?? [];
  const selected = items.find((item) => item.id === selectedId) ?? null;

  async function handleFile(file: File) {
    const uploaded = await upload.mutateAsync(file);
    const created = await createDocument.mutateAsync({
      docType,
      sourceType: "file",
      title: title.trim() || file.name,
      documentId: uploaded.documentId,
      storagePath: uploaded.storagePath,
      mimeType: uploaded.mimeType,
      byteSize: uploaded.byteSize,
    });
    // 업로드한 문서는 텍스트 추출이 끝나야 준비 가드를 통과합니다.
    const extracted = await extractDocument.mutateAsync(created.id);
    onSelect(extracted);
  }

  async function handleText() {
    const created = await createDocument.mutateAsync({
      docType,
      sourceType: "text",
      title: title.trim() || label,
      extractedText: text,
    });
    onSelect(created);
    setText("");
    setTitle("");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">{label}</h3>
        {selected ? (
          <Badge variant={selected.extractionStatus === "succeeded" ? "secondary" : "outline"}>
            {EXTRACTION_STATUS_LABEL[selected.extractionStatus]}
          </Badge>
        ) : null}
      </div>

      {/* 추출 실패는 세션의 종료가 아니라 **문서 상태**입니다(계약 4.4절). */}
      {selected?.extractionStatus === "failed" ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden />
          <AlertTitle>이 문서의 텍스트를 읽지 못했습니다</AlertTitle>
          <AlertDescription>
            <p>
              {selected.extractionError ??
                "스캔한 이미지 PDF는 아직 읽을 수 없습니다."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={extractDocument.isPending}
                onClick={() => {
                  extractDocument.mutate(selected.id, { onSuccess: onSelect });
                }}
              >
                다시 읽기
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="library">
        <TabsList>
          <TabsTrigger value="library">보관함에서 고르기</TabsTrigger>
          <TabsTrigger value="upload">새로 올리기</TabsTrigger>
          <TabsTrigger value="text">직접 입력</TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="pt-3">
          {documents.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : documents.isError ? (
            <ErrorState
              error={documents.error}
              onRetry={() => void documents.refetch()}
            />
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              아직 올린 문서가 없습니다. 새로 올리거나 직접 입력해 주세요.
            </p>
          ) : (
            <RadioGroup
              value={selectedId ?? ""}
              onValueChange={(next) => {
                const found = items.find((item) => item.id === next);
                if (found) onSelect(found);
              }}
              disabled={disabled}
              aria-label={`${label} 선택`}
              className="space-y-2"
            >
              {items.map((item) => (
                <Label
                  key={item.id}
                  htmlFor={`doc-${item.id}`}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm",
                    selectedId === item.id && "border-primary bg-muted",
                  )}
                >
                  <RadioGroupItem id={`doc-${item.id}`} value={item.id} />
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  {item.extractionStatus === "succeeded" ? (
                    <CheckCircle2 className="size-4 text-muted-foreground" aria-hidden />
                  ) : (
                    <Badge variant="outline">
                      {EXTRACTION_STATUS_LABEL[item.extractionStatus]}
                    </Badge>
                  )}
                </Label>
              ))}
            </RadioGroup>
          )}
        </TabsContent>

        <TabsContent value="upload" className="space-y-2 pt-3">
          <Label htmlFor={`upload-title-${docType}`}>문서 이름 (선택)</Label>
          <Input
            id={`upload-title-${docType}`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="예: 2026 상반기 이력서"
            disabled={disabled}
          />
          <Label htmlFor={`upload-file-${docType}`}>파일 선택</Label>
          <Input
            id={`upload-file-${docType}`}
            type="file"
            accept=".pdf,.txt,.md,.docx"
            disabled={disabled || upload.isPending || createDocument.isPending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <p className="text-xs text-muted-foreground">
            스캔한 이미지 PDF는 아직 읽지 못합니다. 그럴 때는 직접 입력 탭을 이용해 주세요.
          </p>
          {upload.isError ? (
            <p className="text-sm text-destructive">{upload.error.message}</p>
          ) : null}
        </TabsContent>

        <TabsContent value="text" className="space-y-2 pt-3">
          <Label htmlFor={`text-title-${docType}`}>문서 이름 (선택)</Label>
          <Input
            id={`text-title-${docType}`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={disabled}
          />
          <Label htmlFor={`text-body-${docType}`}>내용</Label>
          <Textarea
            id={`text-body-${docType}`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={8}
            placeholder="내용을 붙여 넣어 주세요."
            disabled={disabled}
          />
          <Button
            size="sm"
            disabled={disabled || text.trim().length === 0 || createDocument.isPending}
            onClick={() => void handleText()}
          >
            이 내용으로 저장
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
