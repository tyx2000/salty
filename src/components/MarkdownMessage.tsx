import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownMessageProps = {
  content: string;
};

export const MarkdownMessage = memo(function MarkdownMessage({
  content,
}: MarkdownMessageProps) {
  const displayContent = balanceOpenCodeFence(content);

  return (
    <div className="markdown-message">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
    </div>
  );
});

function balanceOpenCodeFence(content: string) {
  const fenceCount = content.match(/```/g)?.length ?? 0;
  return fenceCount % 2 === 1 ? `${content}\n\`\`\`` : content;
}
