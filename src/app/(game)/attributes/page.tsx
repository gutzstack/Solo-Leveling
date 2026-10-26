"use client";
import Link from "next/link";
import { Icon } from "@/components/system/icon";
import { PageHeader, RankBadge, XpBar } from "@/components/system/primitives";
import { CustomStatDialog } from "@/components/game/custom-stat";
import { Button } from "@/components/ui/button";
import { useSnapshot } from "@/lib/client/use-game";
import { ATTRIBUTE_BY_CODE } from "@/lib/domain/attributes";

export default function AttributesPage() {
  const { data } = useSnapshot();
  if (!data) return null;
  const dark = data.settings.theme === "dark";
  const totalMetrics = data.metrics.length;
  return (
    <div>
      <PageHeader title="Attributes" kicker={`${totalMetrics} trackable metrics`}>
        <CustomStatDialog>
          <Button variant="outline">Create custom stat</Button>
        </CustomStatDialog>
      </PageHeader>
      <p className="mb-5 max-w-3xl text-sm text-dim">
        Each attribute has two separate numbers. <b className="text-fg">Level</b> grows with XP from real actions. <b className="text-fg">Rank</b> reflects measured performance, using population data where it exists and game standards where it doesn&apos;t. Gaining levels never raises a population percentile.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.attributes.map((a) => {
          const def = ATTRIBUTE_BY_CODE[a.code];
          const color = dark ? def.color : def.colorLight;
          return (
            <Link key={a.code} href={`/attributes/${a.code}`} className="sys-panel group relative block p-4 transition-all hover:shadow-[0_0_40px_-8px_var(--glow)] hover:-translate-y-0.5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display text-2xl font-black" style={{ color, textShadow: dark ? `0 0 14px ${color}` : undefined }}>
                    {a.code}
                  </p>
                  <p className="text-sm text-fg">{a.name}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <RankBadge rank={a.rank} />
                  {!a.tracked ? <span className="text-[10px] text-faint">not tracked</span> : null}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between font-mono text-xs text-dim">
                <span>Lv {a.level.level}</span>
                <span>
                  {a.level.xpIntoLevel}/{a.level.xpForNext} XP
                </span>
              </div>
              <XpBar value={a.level.xpIntoLevel} max={a.level.xpForNext} thin label={`${a.name} XP`} color={color} />
              <div className="mt-3 flex items-center gap-2 text-xs text-faint">
                <Icon name={def.icon} className="size-4" />
                {a.loggedMetrics}/{a.totalMetrics} metrics with data · {a.scoredMetrics} ranked
              </div>
              {a.score !== null ? (
                <p className="mt-1 font-mono text-[11px] text-dim">
                  Score {a.score}
                  {a.uncertainty !== null ? ` ± ${a.uncertainty}` : ""} · {a.evidenceMix.verified}V / {a.evidenceMix.estimated}E / {a.evidenceMix.personal}P
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-faint">Unranked: needs 2+ ranked metrics</p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
