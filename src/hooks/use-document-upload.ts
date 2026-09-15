"use client";

import { useMutation } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";

/**
 * Storage 직업로드 (계약 2.1절 **E2** · `04_data_layer.md` 7.2·7.4절).
 *
 * API 계약 밖입니다 — 클라이언트가 anon 키로 직접 올리므로 서버 함수 실행 시간과
 * 페이로드 한도를 쓰지 않습니다. 반환값은 경로 문자열뿐이라 camelCase 변환 대상이 없습니다.
 *
 * 경로는 `documents/{userId}/{documentId}.{ext}` 이며 **첫 세그먼트가 반드시 `auth.uid()`**
 * 여야 Storage 정책이 통과합니다. `documentId`는 업로드 전에 클라이언트가 만들고,
 * 업로드 성공 **후** `useCreateDocument`(#25)로 행을 만듭니다.
 */

export type UploadedFile = {
  documentId: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
};

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index > 0 ? fileName.slice(index + 1).toLowerCase() : "bin";
}

export function useDocumentUpload() {
  return useMutation({
    mutationFn: async (file: File): Promise<UploadedFile> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("로그인이 필요합니다.");
      }

      const documentId = crypto.randomUUID();
      const storagePath = `${user.id}/${documentId}.${extensionOf(file.name)}`;

      const { error } = await supabase.storage
        .from("documents")
        .upload(storagePath, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (error) {
        throw new Error("파일을 올리지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }

      return {
        documentId,
        storagePath,
        mimeType: file.type || "application/octet-stream",
        byteSize: file.size,
      };
    },
  });
}
