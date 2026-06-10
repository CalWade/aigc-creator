import * as React from "react";
import Image from "next/image";

/**
 * 把 TipTap JSON (StarterKit + Image 扩展) 渲染成 React 节点树,纯 server component 形态。
 * 不引入 @tiptap/html(缺依赖),避免在 SSR 中跑 jsdom。
 *
 * 覆盖 PRD §5.3 富文本要求:段落、标题、列表、引用、代码块、图片、行内样式。
 */

interface TipTapNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

function renderText(node: TipTapNode, key: string): React.ReactNode {
  let el: React.ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        el = <strong>{el}</strong>;
        break;
      case "italic":
        el = <em>{el}</em>;
        break;
      case "strike":
        el = <s>{el}</s>;
        break;
      case "code":
        el = (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.875em] text-foreground">
            {el}
          </code>
        );
        break;
      case "link": {
        const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "#";
        el = (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {el}
          </a>
        );
        break;
      }
      default:
        break;
    }
  }
  return <React.Fragment key={key}>{el}</React.Fragment>;
}

function renderChildren(nodes: TipTapNode[] | undefined, prefix: string): React.ReactNode[] {
  return (nodes ?? []).map((n, i) => renderNode(n, `${prefix}-${i}`));
}

function renderNode(node: TipTapNode, key: string): React.ReactNode {
  switch (node.type) {
    case "doc":
      return <React.Fragment key={key}>{renderChildren(node.content, key)}</React.Fragment>;
    case "paragraph":
      return (
        <p key={key} className="text-[16px] leading-7 text-foreground my-4">
          {renderChildren(node.content, key)}
        </p>
      );
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 2, 1), 6);
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      const cls =
        level === 1
          ? "text-[28px] font-semibold tracking-tight mt-10 mb-4"
          : level === 2
            ? "text-[22px] font-semibold tracking-tight mt-8 mb-3"
            : level === 3
              ? "text-[18px] font-semibold mt-6 mb-2"
              : "text-[16px] font-semibold mt-4 mb-2";
      return (
        <Tag key={key} className={cls}>
          {renderChildren(node.content, key)}
        </Tag>
      );
    }
    case "bulletList":
      return (
        <ul key={key} className="list-disc pl-6 my-4 space-y-1.5 marker:text-muted-foreground">
          {renderChildren(node.content, key)}
        </ul>
      );
    case "orderedList":
      return (
        <ol key={key} className="list-decimal pl-6 my-4 space-y-1.5 marker:text-muted-foreground">
          {renderChildren(node.content, key)}
        </ol>
      );
    case "listItem":
      return (
        <li key={key} className="text-[16px] leading-7 text-foreground">
          {renderChildren(node.content, key)}
        </li>
      );
    case "blockquote":
      return (
        <blockquote
          key={key}
          className="border-l-4 border-primary/40 bg-muted/30 px-4 py-2 my-4 text-muted-foreground italic"
        >
          {renderChildren(node.content, key)}
        </blockquote>
      );
    case "codeBlock": {
      const lang = typeof node.attrs?.language === "string" ? node.attrs.language : null;
      const text = (node.content ?? [])
        .map((c) => (c.type === "text" ? (c.text ?? "") : ""))
        .join("");
      return (
        <pre
          key={key}
          className="rounded-lg border border-border bg-muted/40 px-4 py-3 overflow-x-auto"
        >
          <code className={lang ? `language-${lang}` : undefined}>{text}</code>
        </pre>
      );
    }
    case "horizontalRule":
      return <hr key={key} className="border-border my-8" />;
    case "hardBreak":
      return <br key={key} />;
    case "image": {
      const src = typeof node.attrs?.src === "string" ? node.attrs.src : null;
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      if (!src) return null;
      // 外部图与上传 /assets/* 都用 next/image; 站外域名通过 next.config images 白名单兜底
      const isAbs = /^https?:\/\//.test(src);
      return (
        <span key={key} className="block my-6">
          {isAbs ? (
            <Image
              src={src}
              alt={alt}
              width={1200}
              height={675}
              className="rounded-lg w-full h-auto object-cover"
              unoptimized
            />
          ) : (
            <Image
              src={src}
              alt={alt}
              width={1200}
              height={675}
              sizes="(max-width: 768px) 100vw, 768px"
              className="rounded-lg w-full h-auto object-cover"
            />
          )}
        </span>
      );
    }
    case "text":
      return renderText(node, key);
    default:
      // 未知节点静默降级到 children,保险起见
      return <React.Fragment key={key}>{renderChildren(node.content, key)}</React.Fragment>;
  }
}

export function PostBody({ body }: { body: unknown }) {
  if (!body || typeof body !== "object") return null;
  const root = body as TipTapNode;
  return (
    <div className="text-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2">
      {renderNode(root, "root")}
    </div>
  );
}
