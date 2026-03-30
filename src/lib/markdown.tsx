import React from 'react';

/**
 * Simple markdown to JSX converter
 * Handles basic markdown syntax for documentation
 */

interface MarkdownNode {
  type: string;
  content?: string | (MarkdownNode | string)[];
  level?: number;
  children?: MarkdownNode[];
  alt?: string;
  src?: string;
  href?: string;
  title?: string;
  header?: MarkdownNode[];
  rows?: MarkdownNode[][];
}

function parseMarkdown(content: string): MarkdownNode[] {
  const lines = content.split('\n');
  const nodes: MarkdownNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines
    if (!line.trim()) {
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      nodes.push({
        type: `h${headingMatch[1].length}`,
        content: headingMatch[2],
      });
      i++;
      continue;
    }

    // Code block
    if (line.trim().startsWith('```')) {
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push({
        type: 'code',
        content: codeLines.join('\n').trimEnd(),
      });
      i++; // Skip closing ```
      continue;
    }

    // Tables
    if (line.includes('|')) {
      const tableRows: MarkdownNode[][] = [];
      let tableStart = i;
      while (i < lines.length && lines[i].includes('|')) {
        const cells = lines[i].split('|').map(c => c.trim()).filter(c => c);
        tableRows.push(cells.map(c => ({ type: 'text', content: c })));
        i++;
      }
      if (tableRows.length > 1) {
        nodes.push({
          type: 'table',
          rows: tableRows,
        });
        continue;
      }
    }

    // Unordered lists
    if (line.match(/^(\s*)([-*])\s+/)) {
      const listItems: MarkdownNode[] = [];
      const baseIndent = line.match(/^(\s*)/)![1].length;

      while (i < lines.length && lines[i].match(/^(\s*)([-*])\s+/)) {
        const match = lines[i].match(/^(\s*)([-*])\s+(.+)$/);
        if (match) {
          const indent = match[1].length;
          const content = match[3];
          listItems.push({
            type: 'li',
            content: content,
          });
        }
        i++;
      }

      nodes.push({
        type: 'ul',
        children: listItems,
      });
      continue;
    }

    // Ordered lists
    if (line.match(/^(\s*)\d+\.\s+/)) {
      const listItems: MarkdownNode[] = [];

      while (i < lines.length && lines[i].match(/^(\s*)\d+\.\s+/)) {
        const match = lines[i].match(/^(\s*)\d+\.\s+(.+)$/);
        if (match) {
          const content = match[2];
          listItems.push({
            type: 'li',
            content: content,
          });
        }
        i++;
      }

      nodes.push({
        type: 'ol',
        children: listItems,
      });
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].slice(1).trim());
        i++;
      }
      nodes.push({
        type: 'blockquote',
        content: quoteLines.join('\n'),
      });
      continue;
    }

    // Horizontal rule
    if (line.match(/^([-_*])\1{2,}$/)) {
      nodes.push({ type: 'hr' });
      i++;
      continue;
    }

    // Paragraph
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length && !lines[i].trim().match(/^(#{1,6}|```|[-*]\s|>\s|\d+\.|[-_*]{3,})/)) {
      paraLines.push(lines[i]);
      i++;
    }

    nodes.push({
      type: 'p',
      content: paraLines.join('\n').trim(),
    });
  }

  return nodes;
}

interface RenderOptions {
  headingOffset?: number;
}

export function renderMarkdown(
  content: string,
  options: RenderOptions = {}
): React.ReactNode {
  const { headingOffset = 0 } = options;
  const nodes = parseMarkdown(content);
  return nodes.map((node, i) => renderNode(node, i, headingOffset));
}

function renderNode(node: MarkdownNode, key: React.Key, headingOffset: number = 0): React.ReactNode {
  switch (node.type) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = parseInt(node.type[1]) + headingOffset;
      const clampedLevel = Math.min(Math.max(level, 1), 6);
      const HeadingTag = `h${clampedLevel}` as keyof JSX.IntrinsicElements;
      const className =
        clampedLevel === 1
          ? 'text-4xl font-bold text-gray-900 mt-12 mb-4'
          : clampedLevel === 2
          ? 'text-3xl font-bold text-gray-900 mt-10 mb-4 border-b pb-3'
          : clampedLevel === 3
          ? 'text-2xl font-bold text-gray-900 mt-8 mb-3'
          : clampedLevel === 4
          ? 'text-xl font-bold text-gray-900 mt-6 mb-2'
          : 'text-lg font-bold text-gray-900 mt-6 mb-2';

      // Create ID from heading for anchor links
      const id = (node.content as string)
        ?.toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .trim();

      const Element = React.createElement(
        HeadingTag,
        { key, id, className },
        renderInline(String(node.content || ''))
      );
      return Element;
    }

    case 'p':
      return (
        <p key={key} className="text-gray-700 leading-7 mb-4">
          {renderInline(String(node.content || ''))}
        </p>
      );

    case 'ul':
      return (
        <ul key={key} className="list-disc list-inside space-y-2 text-gray-700 mb-4 ml-2">
          {(node.children || []).map((child: MarkdownNode, i: number) => (
            <li key={i} className="leading-7">
              {renderInline(String(child.content || ''))}
            </li>
          ))}
        </ul>
      );

    case 'ol':
      return (
        <ol key={key} className="list-decimal list-inside space-y-2 text-gray-700 mb-4 ml-2">
          {(node.children || []).map((child: MarkdownNode, i: number) => (
            <li key={i} className="leading-7">
              {renderInline(String(child.content || ''))}
            </li>
          ))}
        </ol>
      );

    case 'blockquote':
      return (
        <blockquote
          key={key}
          className="border-l-4 border-brand-400 pl-4 py-2 bg-brand-50 rounded text-gray-700 italic mb-4"
        >
          {renderInline(String(node.content || ''))}
        </blockquote>
      );

    case 'code':
      return (
        <pre key={key} className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto mb-4">
          <code className="text-sm font-mono">{String(node.content || '')}</code>
        </pre>
      );

    case 'hr':
      return <hr key={key} className="my-8 border-t border-gray-300" />;

    case 'table':
      return (
        <div key={key} className="overflow-x-auto mb-6">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-gray-300">
                {(node.rows?.[0] || []).map((cell: MarkdownNode, i: number) => (
                  <th key={i} className="px-4 py-2 text-left font-semibold text-gray-900">
                    {renderInline(String(cell.content || ''))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(node.rows?.slice(1) || []).map((row: MarkdownNode[], rowIdx: number) => (
                <tr key={rowIdx} className="border-b border-gray-200 hover:bg-gray-50">
                  {(row || []).map((cell: MarkdownNode, cellIdx: number) => (
                    <td key={cellIdx} className="px-4 py-2 text-gray-700">
                      {renderInline(String(cell.content || ''))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    default:
      return null;
  }
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const regex = /\*\*(.+?)\*\*|__(.+?)__|_(.+?)_|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    if (match[1]) {
      // **bold**
      parts.push(
        <strong key={parts.length} className="font-bold">
          {match[1]}
        </strong>
      );
    } else if (match[2]) {
      // __bold__
      parts.push(
        <strong key={parts.length} className="font-bold">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // _italic_
      parts.push(
        <em key={parts.length} className="italic">
          {match[3]}
        </em>
      );
    } else if (match[4]) {
      // *italic*
      parts.push(
        <em key={parts.length} className="italic">
          {match[4]}
        </em>
      );
    } else if (match[5]) {
      // `code`
      parts.push(
        <code
          key={parts.length}
          className="bg-gray-100 text-red-600 px-1.5 py-0.5 rounded text-sm font-mono"
        >
          {match[5]}
        </code>
      );
    } else if (match[6] && match[7]) {
      // [link](url)
      parts.push(
        <a
          key={parts.length}
          href={match[7]}
          target={match[7].startsWith('http') ? '_blank' : undefined}
          rel={match[7].startsWith('http') ? 'noopener noreferrer' : undefined}
          className="text-brand-600 hover:text-brand-700 underline"
        >
          {match[6]}
        </a>
      );
    }

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length === 0 ? text : parts;
}
