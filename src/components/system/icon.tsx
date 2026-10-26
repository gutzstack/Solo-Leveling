"use client";
import { Activity, Apple, BadgeCheck, BarChart3, BedDouble, Bike, BookMarked, BookOpen, Brain, CalendarCheck, CalendarRange, ChevronsUp, ClipboardCheck, Coins, Crown, DoorOpen, Dumbbell, Eye, Flame, Flower2, Footprints, Gauge, Gem, Globe, GraduationCap, HandHeart, Handshake, HeartHandshake, HeartPulse, Hexagon, Landmark, Layers, ListChecks, Lock, LogIn, Medal, MessagesSquare, Mic, Moon, Mountain, Network, NotebookPen, PenTool, PersonStanding, PiggyBank, Presentation, RotateCcw, Route, Scale, ScrollText, Shield, ShieldCheck, Siren, Skull, SlidersHorizontal, Smile, Sparkle, Sparkles, Sprout, Star, StretchHorizontal, Target, TrendingUp, Trophy, Unlink, UserRoundCheck, Users, Wallet, Waves, Wind, Zap, Circle, type LucideIcon } from "lucide-react";

/** Explicit icon map (keeps the bundle small; catalogs refer to icons by name). */
const ICONS: Record<string, LucideIcon> = { Activity, Apple, BadgeCheck, BarChart3, BedDouble, Bike, BookMarked, BookOpen, Brain, CalendarCheck, CalendarRange, ChevronsUp, ClipboardCheck, Coins, Crown, DoorOpen, Dumbbell, Eye, Flame, Flower2, Footprints, Gauge, Gem, Globe, GraduationCap, HandHeart, Handshake, HeartHandshake, HeartPulse, Hexagon, Landmark, Layers, ListChecks, Lock, LogIn, Medal, MessagesSquare, Mic, Moon, Mountain, Network, NotebookPen, PenTool, PersonStanding, PiggyBank, Presentation, RotateCcw, Route, Scale, ScrollText, Shield, ShieldCheck, Siren, Skull, SlidersHorizontal, Smile, Sparkle, Sparkles, Sprout, Star, StretchHorizontal, Target, TrendingUp, Trophy, Unlink, UserRoundCheck, Users, Wallet, Waves, Wind, Zap };

export function Icon({ name, className }: { name: string; className?: string }) {
  const C = ICONS[name] ?? Circle;
  return <C className={className} aria-hidden="true" />;
}
