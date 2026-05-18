/**
 * Campos de `File` seguros para exponer al cliente.
 * Omite `path` y `storedName` (rutas internas del servidor).
 * Úsalo en cualquier `include: { files: FILE_PUBLIC_SELECT }`.
 */
export const FILE_PUBLIC_SELECT = {
  select: {
    id: true,
    originalName: true,
    mimeType: true,
    size: true,
    createdAt: true,
    uploadedById: true,
    activityId: true,
    commentId: true,
    stageChangeRequestId: true,
    stageChangeCommentId: true,
  },
} as const;
