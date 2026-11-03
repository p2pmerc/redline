"use client";

// ---------------------------------------------------------------------------
// Components never import an icon directly: they look one up by the role it
// plays (`useIcons()["chevron-down"]`). That keeps the icon set swappable in
// one place, so an app on another library wraps its tree in IconProvider and
// every component follows. Phosphor is the default and the only icon library
// this file depends on.
//
// Components read from the map rather than calling `useIcon(name)`: React
// Compiler's lint (`react-hooks/static-components`, on in a fresh Next app)
// takes a component returned by a hook call for one created during render,
// and flags rendering it. A property read from the map is the same lookup
// without the false alarm.
// ---------------------------------------------------------------------------

import { createContext, useContext, useMemo, type ComponentType, type ReactNode } from "react";

import {
  CaretRight, CaretDown, X, Copy, List, DotOutline, Desktop, Sun, Moon, Rectangle, Circle,
  Books, Clock, Star, GearSix, Plus, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, MagnifyingGlass,
  CircleNotch, Users, Lock, EnvelopeSimple, Bell, ShieldCheck, Palette, Lightbulb, RocketLaunch,
  Heart, PaintBrush, Brain, Globe, User, Image as ImageGlyph, LinkSimple, Check, ArrowCounterClockwise,
  Play, Pause, Eyedropper, House, ChatCircle, Tray, PencilSimple, ArrowsOutSimple, SkipForward,
  ArrowElbowDownRight, ArrowElbowDownLeft, SidebarSimple, CaretUpDown, DotsThree, DotsThreeVertical,
  CalendarBlank, Folder, SlidersHorizontal, Info,
} from "@phosphor-icons/react";

// The whole contract an icon has to meet. Components pass `strokeWidth` and
// also animate stroke width through `className` (1.5 → 2 on hover is a
// common cue), so an icon from another library should forward both to its
// `<svg>`. A filled icon set ignores them and simply loses that cue.
export interface IconComponentProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export type IconComponent = ComponentType<IconComponentProps>;

// Names describe the role, not the glyph, so a library whose icon is called
// something else still fills the same slot (`more-horizontal` is Phosphor's
// Ellipsis).
export type IconName =
  | "chevron-right" | "chevron-down" | "x" | "copy" | "menu" | "dot"
  | "monitor" | "sun" | "moon" | "rectangle-horizontal" | "circle"
  | "square-library" | "clock" | "star" | "settings"
  | "plus" | "arrow-left" | "arrow-right" | "arrow-up" | "arrow-down"
  | "search" | "loader"
  | "users" | "lock" | "mail" | "bell" | "shield" | "palette"
  | "lightbulb" | "rocket" | "heart" | "paintbrush" | "brain"
  | "globe" | "user"
  | "image" | "link" | "check" | "rotate-ccw"
  | "play" | "pause" | "pipette"
  | "home" | "message-circle" | "inbox"
  | "pencil" | "scaling" | "skip-forward" | "corner-down-right" | "corner-down-left"
  | "panel-left" | "panel-right" | "chevrons-up-down" | "more-horizontal" | "more-vertical" | "calendar" | "folder"
  | "sliders-horizontal" | "info";

export const defaultIcons: Record<IconName, IconComponent> = {
  "chevron-right": CaretRight,
  "chevron-down": CaretDown,
  "pipette": Eyedropper,
  "x": X,
  "copy": Copy,
  "menu": List,
  "dot": DotOutline,
  "monitor": Desktop,
  "sun": Sun,
  "moon": Moon,
  "rectangle-horizontal": Rectangle,
  "circle": Circle,
  "square-library": Books,
  "clock": Clock,
  "star": Star,
  "settings": GearSix,
  "plus": Plus,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
  "search": MagnifyingGlass,
  "loader": CircleNotch,
  "users": Users,
  "lock": Lock,
  "mail": EnvelopeSimple,
  "bell": Bell,
  "shield": ShieldCheck,
  "palette": Palette,
  "lightbulb": Lightbulb,
  "rocket": RocketLaunch,
  "heart": Heart,
  "paintbrush": PaintBrush,
  "brain": Brain,
  "globe": Globe,
  "user": User,
  "image": ImageGlyph,
  "link": LinkSimple,
  "check": Check,
  "rotate-ccw": ArrowCounterClockwise,
  "play": Play,
  "pause": Pause,
  "home": House,
  "message-circle": ChatCircle,
  "inbox": Tray,
  "pencil": PencilSimple,
  "scaling": ArrowsOutSimple,
  "skip-forward": SkipForward,
  "corner-down-right": ArrowElbowDownRight,
  "corner-down-left": ArrowElbowDownLeft,
  "panel-left": SidebarSimple,
  "panel-right": SidebarSimple,
  "chevrons-up-down": CaretUpDown,
  "more-horizontal": DotsThree,
  "more-vertical": DotsThreeVertical,
  "calendar": CalendarBlank,
  "folder": Folder,
  "sliders-horizontal": SlidersHorizontal,
  "info": Info,
};

const IconContext = createContext<Record<IconName, IconComponent> | null>(null);

/**
 * Returns a single icon component for the given name.
 * Falls back to the default (Phosphor) set if no provider is present, so a
 * component works on its own before any IconProvider is set up.
 *
 * Fine for passing an icon on as a prop. To render it as `<Icon />`, take it
 * from `useIcons()` instead (see the note at the top of this file).
 */
function useIcon(name: IconName): IconComponent {
  const icons = useContext(IconContext);
  return (icons ?? defaultIcons)[name];
}

/**
 * Returns the full icon map.
 * Falls back to the default (Phosphor) set if no provider is present.
 */
function useIcons(): Record<IconName, IconComponent> {
  const icons = useContext(IconContext);
  return icons ?? defaultIcons;
}

/**
 * Swap some or all icons for components from another library.
 * Names left out of `icons` keep their default (Phosphor) component, so a
 * partial map never leaves a component without an icon.
 *
 * Pass a stable `icons` object (module scope or memoized): an inline object
 * is new on every render and re-renders every component that reads an icon.
 */
function IconProvider({
  children,
  icons,
}: {
  children: ReactNode;
  icons?: Partial<Record<IconName, IconComponent>>;
}) {
  const value = useMemo(() => ({ ...defaultIcons, ...icons }), [icons]);
  return <IconContext.Provider value={value}>{children}</IconContext.Provider>;
}

export { IconProvider, useIcon, useIcons };
