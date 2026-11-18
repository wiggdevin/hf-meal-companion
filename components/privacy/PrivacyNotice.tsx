"use client";

import Link from "next/link";
import CardFrame from "@/components/ui/CardFrame";
import PageTitle from "@/components/ui/PageTitle";
import Tag from "@/components/ui/Tag";
import { PROCESSORS } from "@/components/settings/ProcessorsSection";
import { DELETED_ITEMS } from "@/components/settings/DeleteAccountCard";
import { APP_NAME } from "@/lib/brand";

const BODY = "m-0 text-body font-normal text-charcoal [text-wrap:pretty]";
const LIST = "m-0 flex list-disc flex-col gap-1.5 pl-5 text-body font-normal text-charcoal";
const CAPTION = "m-0 text-caption font-normal text-muted";

/**
 * The /privacy page's text (readiness audit 2026-11-17, A2). Plain language, from
 * docs/ai-data-handling.md and the code only: what the app stores, who processes it (the Settings
 * list, `PROCESSORS`), how health text is handled, export and delete, and how to reach us (the
 * in-app feedback). A test version: no legal claim, no promise the docs do not make.
 */
export default function PrivacyNotice({ deletionEnabled }: { deletionEnabled: boolean }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-10"
      style={{ paddingTop: "calc(var(--safe-top) + 20px)" }}>
      <PageTitle eyebrow={APP_NAME} title="Privacy" />
      <div className="flex flex-col gap-2">
        <Tag tone="yellow" className="self-start">Test version</Tag>
        <p className={CAPTION}>
          {APP_NAME} is being tested with a small group. This page explains, in plain words, what the app
          does with your data today. It is not a legal agreement and it may change before a wider release.
        </p>
      </div>

      <Section title="What the app stores">
        <p className={BODY}>When you use {APP_NAME}, your account holds:</p>
        <ul className={LIST}>
          <li>Your email address, used to sign you in</li>
          {DELETED_ITEMS.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <p className={CAPTION}>
          Some of it, such as your meals, is also kept on your phone so the app works offline.
          When the app crashes it sends an error code, the screen and the app version, with no account details.
        </p>
      </Section>

      <Section title="Health information">
        <ul className={LIST}>
          <li>Food rules, allergies and conditions you enter are stored with your account and used to plan your meals.</li>
          <li>When the coach recognises a medical question, it gives a fixed reply that points you to your doctor and does not send that question to an AI model. The check can miss some questions, so a missed one goes to the coach like any other message.</li>
          <li>
            A coach message that involves your health notes can go to Google Gemini on a paid plan, with
            request log storage turned off in our project settings.
          </li>
          <li>The weekly review sends only seven days of nutrition totals and an energy estimate, not your conditions or notes.</li>
          <li>
            TypeSafe (Jev) sorts and checks requests. It gets only the text a question needs, such as what you type to
            the coach, meal names and the coach&apos;s replies, so that text can include health details you wrote. The
            app does not add your name, email, saved health conditions, gut notes or stored notes.
          </li>
          <li>
            Requests through OpenRouter ask to go only to model providers that do not train on them and keep no copy
            (OpenRouter&apos;s &ldquo;deny data collection&rdquo; and &ldquo;zero data retention&rdquo; settings).
          </li>
        </ul>
      </Section>

      <Section title="Who handles your data">
        <p className={BODY}>These services process what you enter so the app can work:</p>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {PROCESSORS.map((processor) => (
            <li key={processor.name} className="flex flex-col gap-1">
              <span className="text-body font-medium text-charcoal">{processor.name}</span>
              <span className={CAPTION}>{processor.what}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Download your food log">
        <p className={BODY}>
          In Settings, under Data &amp; account, Export downloads your logged meals and your daily totals as spreadsheets.
        </p>
      </Section>

      <Section title="Delete your account">
        {deletionEnabled ? (
          <p className={BODY}>
            In Settings, under Data &amp; account, Delete account removes your account and everything in it for good.
            Backup copies of the database and of your photos and voice notes are not edited, so your data can
            stay in them after you delete your account. You can download your food log first.
          </p>
        ) : (
          <p className={BODY}>
            Self-serve deletion is not switched on in this test version yet. Send feedback from Settings asking us to
            delete your account.
          </p>
        )}
      </Section>

      <Section title="Questions">
        <p className={BODY}>
          Use Send feedback in Settings, under Data &amp; account. Your message is saved with your account so we can reply.
        </p>
      </Section>

      <Link href="/" className="self-center text-caption text-muted underline">Back to {APP_NAME}</Link>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <CardFrame as="section" size="md" title={title} titleAs="h2">
      <div className="flex flex-col gap-3">{children}</div>
    </CardFrame>
  );
}
