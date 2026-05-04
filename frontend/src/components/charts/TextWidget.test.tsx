import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TextWidget } from "./TextWidget";

describe("TextWidget", () => {
  it("renders empty state when no content", () => {
    render(<TextWidget content="" />);
    expect(screen.getByText(/no content/i)).toBeInTheDocument();
  });

  it("renders paragraphs from markdown", () => {
    render(<TextWidget content="Hello world" />);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders headers from markdown", () => {
    render(<TextWidget content="# Title" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Title");
  });

  it("renders bold text from markdown", () => {
    render(<TextWidget content="**bold text**" />);
    expect(screen.getByText("bold text")).toBeInTheDocument();
    expect(screen.getByText("bold text").tagName).toBe("STRONG");
  });

  it("renders inline code from markdown", () => {
    render(<TextWidget content="`code here`" />);
    expect(screen.getByText("code here")).toBeInTheDocument();
    expect(screen.getByText("code here").tagName).toBe("CODE");
  });

  describe("link security", () => {
    it("renders valid https:// links as anchors", () => {
      render(<TextWidget content="[safe](https://example.com)" />);
      const link = screen.getByRole("link", { name: "safe" });
      expect(link).toHaveAttribute("href", "https://example.com");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("renders valid http:// links as anchors", () => {
      render(<TextWidget content="[link](http://example.com)" />);
      const link = screen.getByRole("link", { name: "link" });
      expect(link).toHaveAttribute("href", "http://example.com");
    });

    it("renders valid mailto: links as anchors", () => {
      render(<TextWidget content="[email](mailto:user@example.com)" />);
      const link = screen.getByRole("link", { name: "email" });
      expect(link).toHaveAttribute("href", "mailto:user@example.com");
    });

    it("renders valid relative /path links as anchors", () => {
      render(<TextWidget content="[page](/dashboards/abc)" />);
      const link = screen.getByRole("link", { name: "page" });
      expect(link).toHaveAttribute("href", "/dashboards/abc");
    });

    it("blocks javascript: URLs — renders as span", () => {
      render(<TextWidget content="[xss](javascript:alert(1))" />);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText("xss").tagName).toBe("SPAN");
    });

    it("blocks data: URLs — renders as span", () => {
      render(
        <TextWidget content={'[xss](data:text/html,<script>alert(1)</script>)'} />,
      );
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText("xss").tagName).toBe("SPAN");
    });

    it("blocks vbscript: URLs — renders as span", () => {
      render(<TextWidget content="[xss](vbscript:MsgBox)" />);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText("xss").tagName).toBe("SPAN");
    });

    it("blocks JAVASCRIPT: (case-insensitive) — renders as span", () => {
      render(<TextWidget content="[xss](JAVASCRIPT:alert(1))" />);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText("xss").tagName).toBe("SPAN");
    });
  });
});
