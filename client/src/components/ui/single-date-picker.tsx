import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { format, isValid, parse } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Button } from '@client/src/components/ui/button';
import { Calendar } from '@client/src/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@client/src/components/ui/popover';
import { cn } from '@client/src/lib/utils';

interface SingleDatePickerProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function parseDateValue(value?: string): Date | undefined {
  if (!value) return undefined;
  const datePart = value.slice(0, 10);
  const parsed = parse(datePart, 'yyyy-MM-dd', new Date());
  return isValid(parsed) ? parsed : undefined;
}

export function SingleDatePicker({
  value,
  onChange,
  placeholder = '选择日期',
  disabled,
  className,
}: SingleDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseDateValue(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'h-8 w-full justify-between gap-2 rounded-md px-3 text-xs font-normal',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <span>{selected ? format(selected, 'yyyy-MM-dd') : placeholder}</span>
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto overflow-hidden rounded-lg p-0">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            onChange(date ? format(date, 'yyyy-MM-dd') : '');
            setOpen(false);
          }}
          initialFocus
          locale={zhCN}
          labels={{ labelMonthDropdown: () => '选择月份', labelYearDropdown: () => '选择年份' }}
          captionLayout="dropdown"
          formatters={{ formatMonthDropdown: (date) => format(date, 'M月', { locale: zhCN }) }}
          fromYear={2020}
          toYear={2035}
          className="rounded-lg"
        />
      </PopoverContent>
    </Popover>
  );
}
