"use client";

import {
  CopyIcon,
  MicIcon,
  PauseIcon,
  PlusIcon,
  SquareIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@simon-says/ui/components/avatar";
import { Badge } from "@simon-says/ui/components/badge";
import { Button } from "@simon-says/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@simon-says/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@simon-says/ui/components/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@simon-says/ui/components/drawer";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@simon-says/ui/components/field";
import { Input } from "@simon-says/ui/components/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@simon-says/ui/components/input-otp";
import {
  RadioGroup,
  RadioGroupItem,
} from "@simon-says/ui/components/radio-group";
import { Switch } from "@simon-says/ui/components/switch";
import { Tabs, TabsList, TabsTrigger } from "@simon-says/ui/components/tabs";
import { Textarea } from "@simon-says/ui/components/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@simon-says/ui/components/tooltip";
import { BrandMark } from "@/components/brand-mark";
import { JoinCode } from "@/components/join-code";
import { LevelMeter } from "@/components/level-meter";
import { LiveBadge } from "@/components/live-badge";
import { TranscriptLine } from "@/components/transcript-line";

type DemoProps = { title: string; usedIn: string; children: ReactNode };

const Demo = ({ title, usedIn, children }: DemoProps) => (
  <Card>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      <CardDescription>Used in: {usedIn}</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-wrap items-center gap-3">
      {children}
    </CardContent>
  </Card>
);

export const Showcase = () => (
  <>
    <section aria-labelledby="ds-components" className="flex flex-col gap-4">
      <h2 id="ds-components" className="text-xl font-semibold">
        Components
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Demo title="Button" usedIn="every screen">
          <Button>End session</Button>
          <Button variant="outline">
            <PauseIcon data-icon="inline-start" />
            Pause
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Download transcript</Button>
          <Button variant="destructive">
            <SquareIcon data-icon="inline-start" />
            Stop
          </Button>
          <Button variant="link">Resend code</Button>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Larger text"
                />
              }
            >
              <PlusIcon />
            </TooltipTrigger>
            <TooltipContent>Larger text</TooltipContent>
          </Tooltip>
        </Demo>

        <Demo title="Badge and avatar" usedIn="headers, sessions table">
          <Badge>Scheduled</Badge>
          <Badge variant="secondary">Draft</Badge>
          <Badge variant="outline">Ended</Badge>
          <Avatar>
            <AvatarFallback>JL</AvatarFallback>
          </Avatar>
        </Demo>

        <Demo
          title="Field, input, textarea"
          usedIn="sign-in, new session, notes"
        >
          <Field>
            <FieldLabel htmlFor="ds-email">Work email</FieldLabel>
            <Input id="ds-email" type="email" placeholder="you@company.com" />
            <FieldDescription>
              We email you a code. No password.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="ds-note">Add a note</FieldLabel>
            <Textarea id="ds-note" placeholder="Why this matters to you…" />
          </Field>
        </Demo>

        <Demo title="One-time code" usedIn="host and guest email code">
          <InputOTP maxLength={6} aria-label="6-digit code">
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <InputOTPSlot key={index} index={index} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </Demo>

        <Demo
          title="Switch and radio choice"
          usedIn="guest settings, start time"
        >
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="ds-interim">
                Show words as they’re spoken
              </FieldLabel>
              <FieldDescription>
                Off: guests only see finished lines
              </FieldDescription>
            </FieldContent>
            <Switch id="ds-interim" defaultChecked />
          </Field>
          <RadioGroup defaultValue="now" className="w-full sm:grid-cols-2">
            <FieldLabel htmlFor="ds-now">
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Start now</FieldTitle>
                  <FieldDescription>Open the lobby right away</FieldDescription>
                </FieldContent>
                <RadioGroupItem value="now" id="ds-now" />
              </Field>
            </FieldLabel>
            <FieldLabel htmlFor="ds-later">
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Schedule</FieldTitle>
                  <FieldDescription>Pick a date and time</FieldDescription>
                </FieldContent>
                <RadioGroupItem value="later" id="ds-later" />
              </Field>
            </FieldLabel>
          </RadioGroup>
        </Demo>

        <Demo
          title="Tabs, dialog, drawer, toast"
          usedIn="my notes, host gate, clip sheet"
        >
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="clips">Clips</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>
          </Tabs>
          <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>
              Open dialog
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  Create a host account to start a session
                </DialogTitle>
                <DialogDescription>
                  Sessions belong to a host, so we need to know who’s running
                  this one.
                </DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
          <Drawer>
            <DrawerTrigger render={<Button variant="outline" />}>
              Open drawer
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Clip to notes</DrawerTitle>
              </DrawerHeader>
            </DrawerContent>
          </Drawer>
          <Button variant="outline" onClick={() => toast("Link copied")}>
            <CopyIcon data-icon="inline-start" />
            Copy link
          </Button>
        </Demo>
      </div>
      <p className="text-sm text-muted-foreground">
        Also installed: alert, breadcrumb, dropdown-menu, empty, item,
        scroll-area, select, separator, sheet, skeleton, spinner, table, toggle,
        toggle-group.
      </p>
    </section>

    <section aria-labelledby="ds-patterns" className="flex flex-col gap-4">
      <h2 id="ds-patterns" className="text-xl font-semibold">
        Simon Says patterns
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Demo title="Brand mark and live status" usedIn="app headers">
          <BrandMark />
          <LiveBadge elapsed="00:14:32" />
          <Button variant="outline" size="sm">
            <MicIcon data-icon="inline-start" />
            Podium mic (USB)
            <LevelMeter level={4} label="Input level, good" />
          </Button>
        </Demo>
        <Demo title="Join code" usedIn="host lobby and live console">
          <JoinCode code="KQ742M" href="https://simonsays.live/KQ742M" />
        </Demo>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Transcript line</CardTitle>
            <CardDescription>
              Used in: host console, guest live view
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            <TranscriptLine
              time="00:12:04"
              text="Good morning, everyone, and thank you for being here so early."
            />
            <TranscriptLine
              time="Now"
              text="and the first thing we heard from attendees was that they wanted to read along"
              interim
            />
          </CardContent>
        </Card>
      </div>
    </section>
  </>
);
