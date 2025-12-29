import { Dumbbell, Heart, Activity, Zap, Target, HeartPulse, LucideIcon } from "lucide-react";

export type Category = "arms" | "chest" | "back" | "legs" | "core" | "cardio";

interface CategoryConfig {
  icon: LucideIcon;
  label: string;
  color: string;
}

export const categoryConfig: Record<Category, CategoryConfig> = {
  arms: { icon: Dumbbell, label: "Arms", color: "text-primary" },
  chest: { icon: Heart, label: "Chest", color: "text-accent" },
  back: { icon: Activity, label: "Back", color: "text-primary" },
  legs: { icon: Zap, label: "Legs", color: "text-accent" },
  core: { icon: Target, label: "Core", color: "text-primary" },
  cardio: { icon: HeartPulse, label: "Cardio", color: "text-accent" },
};

export const categories: Category[] = ["arms", "chest", "back", "legs", "core", "cardio"];

export function getCategoryIcon(category: string): LucideIcon {
  return categoryConfig[category as Category]?.icon || Dumbbell;
}

export function getCategoryConfig(category: string): CategoryConfig {
  return categoryConfig[category as Category] || categoryConfig.arms;
}
