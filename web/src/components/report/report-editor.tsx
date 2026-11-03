import { useEffect } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Markdown } from "@tiptap/markdown";
import { common, createLowlight } from "lowlight";
import {
  TextB, TextItalic, TextHOne, TextHTwo, ListBullets, ListNumbers, Quotes, Code, CodeBlock, Minus,
  ArrowArcLeft, ArrowArcRight, type Icon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

const lowlight = createLowlight(common);

interface ReportEditorProps {
  /** Markdown source. */
  value: string;
  onChange?: (markdown: string) => void;
  editable?: boolean;
  placeholder?: string;
  className?: string;
}

interface ToolbarAction {
  label: string;
  icon: Icon;
  run: (editor: Editor) => void;
  active?: (editor: Editor) => boolean;
}

const actions: (ToolbarAction | "divider")[] = [
  { label: "Bold", icon: TextB, run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive("bold") },
  { label: "Italic", icon: TextItalic, run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive("italic") },
  "divider",
  { label: "Heading 1", icon: TextHOne, run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(), active: (e) => e.isActive("heading", { level: 1 }) },
  { label: "Heading 2", icon: TextHTwo, run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), active: (e) => e.isActive("heading", { level: 2 }) },
  "divider",
  { label: "Bulleted list", icon: ListBullets, run: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive("bulletList") },
  { label: "Numbered list", icon: ListNumbers, run: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive("orderedList") },
  { label: "Quote", icon: Quotes, run: (e) => e.chain().focus().toggleBlockquote().run(), active: (e) => e.isActive("blockquote") },
  "divider",
  { label: "Inline code", icon: Code, run: (e) => e.chain().focus().toggleCode().run(), active: (e) => e.isActive("code") },
  { label: "Code block", icon: CodeBlock, run: (e) => e.chain().focus().toggleCodeBlock().run(), active: (e) => e.isActive("codeBlock") },
  { label: "Divider", icon: Minus, run: (e) => e.chain().focus().setHorizontalRule().run() },
  "divider",
  { label: "Undo", icon: ArrowArcLeft, run: (e) => e.chain().focus().undo().run() },
  { label: "Redo", icon: ArrowArcRight, run: (e) => e.chain().focus().redo().run() },
];

export function ReportEditor({ value, onChange, editable = true, placeholder = "Describe the vulnerability, its impact and how to reproduce it…", className }: ReportEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight }),
      Placeholder.configure({ placeholder }),
      Markdown,
    ],
    content: value,
    contentType: "markdown",
    editable,
    editorProps: { attributes: { class: "typeset min-h-[320px] px-5 py-4 outline-none", "aria-label": "Report body" } },
    onUpdate: ({ editor: e }) => onChange?.(e.getMarkdown()),
  });

  useEffect(() => {
    if (editor && editor.getMarkdown() !== value) editor.commands.setContent(value, { contentType: "markdown" });
    // only re-sync when the external value changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  if (!editor) {
    return <div className={cn("h-[380px] animate-pulse rounded-2xl bg-foreground/[0.05]", className)} aria-busy="true" />;
  }

  return (
    <div className={cn("overflow-hidden card-hairline", className)}>
      {editable && (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border/60 bg-surface-2 p-1.5" role="toolbar" aria-label="Formatting">
          {actions.map((a, i) =>
            a === "divider" ? (
              <span key={i} className="mx-1 h-5 w-px bg-border" aria-hidden />
            ) : (
              <Tooltip key={a.label} content={a.label}>
                <button
                  type="button"
                  onClick={() => a.run(editor)}
                  aria-label={a.label}
                  aria-pressed={a.active?.(editor) ?? undefined}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-hover hover:text-foreground",
                    a.active?.(editor) && "bg-active text-foreground",
                  )}
                >
                  <a.icon size={16} weight={a.active?.(editor) ? "bold" : "regular"} />
                </button>
              </Tooltip>
            ),
          )}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
