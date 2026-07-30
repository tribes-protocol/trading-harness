'use client'

import { type AnchorHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

/**
 * Assistant prose. `remark-gfm` + `remark-breaks` match Pi's own markdown semantics
 * (gfm on, single newlines are breaks), and react-markdown renders raw HTML as
 * literal text by default — which matches Pi's html-as-text tokenizer and keeps agent
 * output from injecting markup into the console.
 */

function isHttpHref(href: string | undefined): boolean {
  if (href === undefined) {
    return false
  }
  return href.startsWith('http://') || href.startsWith('https://')
}

interface ChatMarkdownProps {
  content: string
}

export function ChatMarkdown({ content }: ChatMarkdownProps): ReactNode {
  return (
    <div className="wrap-anywhere space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          // Only real web links become anchors. Anything else (mailto, relative)
          // degrades to text — agent output never navigates the console.
          a: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) =>
            isHttpHref(href) ? (
              <a
                {...props}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-info underline underline-offset-2"
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          p: (props: HTMLAttributes<HTMLParagraphElement>) => (
            <p {...props} className="leading-relaxed" />
          ),
          ul: (props: HTMLAttributes<HTMLUListElement>) => (
            <ul {...props} className="list-disc space-y-1 pl-5" />
          ),
          ol: (props: HTMLAttributes<HTMLOListElement>) => (
            <ol {...props} className="list-decimal space-y-1 pl-5" />
          ),
          li: (props: HTMLAttributes<HTMLLIElement>) => (
            <li {...props} className="leading-relaxed" />
          ),
          h1: (props: HTMLAttributes<HTMLHeadingElement>) => (
            <h2 {...props} className="text-[13px] font-semibold text-foreground" />
          ),
          h2: (props: HTMLAttributes<HTMLHeadingElement>) => (
            <h3 {...props} className="text-[13px] font-semibold text-foreground" />
          ),
          h3: (props: HTMLAttributes<HTMLHeadingElement>) => (
            <h4 {...props} className="font-semibold text-foreground" />
          ),
          blockquote: (props: HTMLAttributes<HTMLQuoteElement>) => (
            <blockquote
              {...props}
              className="hairline-l border-border pl-3 italic text-muted-foreground"
            />
          ),
          code: (props: HTMLAttributes<HTMLElement>) => (
            <code {...props} className="text-primary" />
          ),
          pre: (props: HTMLAttributes<HTMLPreElement>) => (
            <pre
              {...props}
              className="hairline overflow-x-auto rounded-sm border-border bg-card p-2 text-[11px] leading-relaxed [&_code]:text-muted-foreground"
            />
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
