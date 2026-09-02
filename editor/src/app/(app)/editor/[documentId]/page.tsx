import { EditorWorkspace } from "@/components/editor/editor-workspace";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  return <EditorWorkspace documentId={documentId} />;
}
