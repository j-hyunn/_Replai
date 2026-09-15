"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api/fetch-json";
import { queryKeys } from "@/lib/api/query-keys";
import type {
  DocType,
  Document,
  DocumentCreate,
  DocumentDetail,
} from "@/lib/api/types";

/** 문서 훅 (06_ui_plan.md 3.1·3.2절). */

// #24 GET /api/documents → { documents, nextCursor }
export type DocumentListResponse = {
  documents: Document[];
  nextCursor: string | null;
};

export function useDocuments(filters: { docType?: DocType } = {}) {
  return useQuery({
    queryKey: queryKeys.documents({ docType: filters.docType }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.docType) params.set("docType", filters.docType);
      const query = params.toString();
      return fetchJson<DocumentListResponse>(
        query ? `/api/documents?${query}` : "/api/documents",
      );
    },
  });
}

/**
 * #34 GET /api/documents/[documentId] → { document: DocumentDetail }
 *
 * **삭제 확인 다이얼로그를 열 때만** 실행합니다(`enabled: false` + `refetch()`).
 * 목록의 모든 행에 대해 미리 부르면 문서 수만큼 집계 쿼리가 나갑니다.
 */
export function useDocument(documentId: string | null) {
  return useQuery({
    queryKey: queryKeys.document(documentId ?? ""),
    queryFn: async () => {
      const { document } = await fetchJson<{ document: DocumentDetail }>(
        `/api/documents/${documentId}`,
      );
      return document;
    },
    enabled: false,
  });
}

// #29 GET /api/documents/[documentId]/download-url → { url, expiresInSec }
export type DownloadUrlResponse = { url: string; expiresInSec: 60 };

/** 만료 60초짜리 URL이므로 **자동 실행하지 않습니다.** */
export function useDocumentDownloadUrl(documentId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.document(documentId ?? ""), "download-url"] as const,
    queryFn: () =>
      fetchJson<DownloadUrlResponse>(`/api/documents/${documentId}/download-url`),
    enabled: false,
    gcTime: 0,
  });
}

// #25 POST /api/documents → 201 { document }
export function useCreateDocument() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: DocumentCreate) => {
      const { document } = await fetchJson<{ document: Document }>("/api/documents", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return document;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.documentsRoot() });
    },
  });
}

// #26 POST /api/documents/[documentId]/extract → { document }
export function useExtractDocument() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (documentId: string) => {
      const { document } = await fetchJson<{ document: Document }>(
        `/api/documents/${documentId}/extract`,
        { method: "POST" },
      );
      return document;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.documentsRoot() });
    },
  });
}

// #27 PATCH /api/documents/[documentId] → { document }
export function useUpdateDocument() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      documentId: string;
      title?: string;
      extractedText?: string;
    }) => {
      const { documentId, ...patch } = input;
      const { document } = await fetchJson<{ document: Document }>(
        `/api/documents/${documentId}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      return document;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.documentsRoot() });
    },
  });
}

// #28 DELETE /api/documents/[documentId] → { ok, affectedSessionCount, configuringSessionCount }
export type DeleteDocumentResponse = {
  ok: true;
  affectedSessionCount: number;
  configuringSessionCount: number;
};

export function useDeleteDocument() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) =>
      fetchJson<DeleteDocumentResponse>(`/api/documents/${documentId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.documentsRoot() });
    },
  });
}
