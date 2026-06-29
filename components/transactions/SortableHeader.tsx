/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortColumn, SortDirection } from "@/lib/supabase/transactions";

interface SortableHeaderProps {
  column: SortColumn;
  label: string;
  activeColumn: SortColumn | null;
  activeDirection: SortDirection | null;
  onToggle: (column: SortColumn) => void;
  className?: string;
}

export function SortableHeader({
  column,
  label,
  activeColumn,
  activeDirection,
  onToggle,
  className,
}: SortableHeaderProps) {
  const isActive = activeColumn === column;
  const Icon =
    isActive && activeDirection === "asc"
      ? ArrowUp
      : isActive && activeDirection === "desc"
      ? ArrowDown
      : ArrowUpDown;

  return (
    <button
      type="button"
      onClick={() => onToggle(column)}
      className={cn(
        "inline-flex items-center gap-1 text-left font-medium hover:text-primary transition-colors",
        isActive ? "text-foreground" : "text-foreground/80",
        className,
      )}
    >
      {label}
      <Icon
        className={cn(
          "h-3.5 w-3.5",
          isActive ? "opacity-100" : "opacity-50",
        )}
      />
    </button>
  );
}
