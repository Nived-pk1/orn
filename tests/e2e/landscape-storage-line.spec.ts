/**
 * Step 8.4e, resume 4 item 5 (STUDY build, port 4174, the demo as the visitor's own data, Pixel 7 landscape in Chromium): the storage line is present as ONE 24 px
 * line at the foot of the content column, its words are not clipped, and a tap opens the backup (the export screen).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { devices, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { chooseFile, expectPreview } from "./kit";
import { answerExamCard } from "./exam-kit";

const STUDY =
  process.env.ORN_BASE_URL?.replace(/\/+$/, "") ?? "http://127.0.0.1:4174";
const { defaultBrowserType: _a, ...PIXEL_L } = devices["Pixel 7 landscape"];
test.use({ ...PIXEL_L, baseURL: STUDY, actionTimeout: 60_000 });

const DEMO_FILE = {
  name: "my-own-data.orn.json",
  mimeType: "application/json",
  buffer: readFileSync(resolve(process.cwd(), "data/seed/demo.orn.json")),
};

async function importDemo(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Organic Reaction Navigator" }),
  ).toBeVisible();
  await chooseFile(page, DEMO_FILE);
  await expectPreview(page);
  await page
    .getByRole("dialog", { name: "Import summary" })
    .getByRole("button", { name: "Confirm" })
    .tap();
  await expect(page.getByText(/^Imported \d+ records from /)).toBeVisible({
    timeout: 90_000,
  });
}

test("landscape: the storage line is one 24 px line, whole, and a tap opens the backup", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await importDemo(page);
  await answerExamCard(page);
  const line = page.getByRole("button", {
    name: "Your data may be cleared. Back it up.",
  });
  await expect(line, "the storage line is there").toBeVisible();
  const box = await line.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      h: r.height,
      bottom: r.bottom,
      left: r.left,
      scroll: el.scrollWidth,
      client: el.clientWidth,
      vh: window.innerHeight,
    };
  });
  expect(box.h, "one 24 px line").toBeLessThanOrEqual(24.5);
  expect(box.scroll, "the words are not clipped").toBeLessThanOrEqual(
    box.client + 1,
  );
  expect(
    box.left,
    "in the content column, right of the icon column",
  ).toBeGreaterThanOrEqual(55);
  expect(box.bottom, "at the foot of the screen").toBeGreaterThanOrEqual(
    box.vh - 1,
  );
  await line.tap();
  await expect(
    page.getByRole("heading", { name: /export|back/i }).first(),
    "a tap opens the backup",
  ).toBeVisible();
});
