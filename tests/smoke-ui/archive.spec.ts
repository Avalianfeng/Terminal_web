import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  focusTerminal,
  runTerminalCommand,
  terminalText,
  waitForTerminalText,
} from "./helpers";

const SMOKE_MARKER = "smoke-ui-marker-line";

test.describe("archive terminal smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await focusTerminal(page);
  });

  test("help lists core commands", async ({ page }) => {
    await runTerminalCommand(page, "help");
    await waitForTerminalText(page, /open|projects|thoughts|help/i);
    const text = await terminalText(page);
    expect(text).toMatch(/open/i);
    expect(text).toMatch(/projects/i);
  });

  test("open shows reading panel with document body", async ({ page }) => {
    await runTerminalCommand(page, "open thoughts/archive-system");
    const panel = page.locator(".reading-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".reading-panel__title")).toContainText(
      "Personal Archive System",
    );
    await expect(panel.locator(".reading-panel__body")).toContainText(
      "Person",
    );
  });

  test("edit save and cat round-trip", async ({ page }) => {
    await runTerminalCommand(page, "edit thoughts/archive-system");
    const editor = page.locator(".editor-panel");
    await expect(editor).toBeVisible();
    const input = editor.locator(".editor-panel__input");
    await expect(input).toBeVisible();
    await expect(input).not.toHaveValue("", { timeout: 15_000 });

    const original = await input.inputValue();
    const marked = original.includes(SMOKE_MARKER)
      ? original
      : `${original.trimEnd()}\n${SMOKE_MARKER}\n`;

    await input.fill(marked);
    await editor.getByRole("button", { name: "保存" }).click();
    await expect(editor).toBeHidden({ timeout: 15_000 });

    await runTerminalCommand(page, "open thoughts/archive-system");
    const panel = page.locator(".reading-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".reading-panel__body")).toContainText(
      SMOKE_MARKER,
      { timeout: 15_000 },
    );
    await panel.locator(".reading-panel__close").click();

    await runTerminalCommand(page, "edit thoughts/archive-system");
    await expect(editor).toBeVisible();
    await expect(input).not.toHaveValue("", { timeout: 15_000 });
    const restore = (await input.inputValue()).replace(
      `\n${SMOKE_MARKER}\n`,
      "\n",
    );
    await input.fill(restore);
    await editor.getByRole("button", { name: "保存" }).click();
    await expect(editor).toBeHidden({ timeout: 15_000 });
  });

  test("login shows masked password prompt", async ({ page }) => {
    await runTerminalCommand(page, "login");
    await waitForTerminalText(page, /口令/);
    const text = await terminalText(page);
    expect(text).toMatch(/口令/);
  });

  test("mobile viewport screenshot archive", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await expect(page.locator(".archive-xterm")).toBeVisible({ timeout: 15_000 });
    await mkdir(path.join(process.cwd(), "outputs"), { recursive: true });
    await page.screenshot({
      path: path.join("outputs", "smoke-ui-mobile-375.png"),
      fullPage: true,
    });
  });
});
