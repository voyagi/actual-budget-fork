import {
  forwardRef,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ChangeEvent,
  ComponentProps,
  JSX,
  KeyboardEvent,
  Ref,
} from 'react';
import {
  Button as AriaButton,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  Heading,
} from 'react-aria-components';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { Input } from '@actual-app/components/input';
import { Popover } from '@actual-app/components/popover';
import { styles } from '@actual-app/components/styles';
import type { CSSProperties } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { css } from '@emotion/css';
import { CalendarDate } from '@internationalized/date';
import { addDays, format, isValid, parse, parseISO, subDays } from 'date-fns';

import {
  currentDate,
  getDayMonthFormat,
  getDayMonthRegex,
  getShortYearFormat,
  getShortYearRegex,
} from 'loot-core/shared/months';

import { InputField } from '@desktop-client/components/mobile/MobileForms';
import { useMergedRefs } from '@desktop-client/hooks/useMergedRefs';
import { useSyncedPref } from '@desktop-client/hooks/useSyncedPref';

const FIRST_DAY_MAP: Record<
  string,
  'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'
> = {
  '0': 'sun',
  '1': 'mon',
  '2': 'tue',
  '3': 'wed',
  '4': 'thu',
  '5': 'fri',
  '6': 'sat',
};

/** Convert a JS Date (or formatted date string) to a CalendarDate for react-aria */
function toCalendarDate(date: Date): CalendarDate {
  return new CalendarDate(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  );
}

/** Convert a CalendarDate to a JS Date */
function fromCalendarDate(cd: CalendarDate): Date {
  return new Date(cd.year, cd.month - 1, cd.day);
}

const calendarStyles: CSSProperties = {
  padding: 10,
  color: theme.calendarText,
  background: theme.calendarBackground,
  borderRadius: 4,
  // Header row with prev/next and month/year heading
  '& header': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  // Navigation buttons
  '& [slot="previous"], & [slot="next"]': {
    appearance: 'none',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    color: theme.calendarItemText,
    fontSize: 16,
    lineHeight: 1,
    borderRadius: 4,
    '&:hover': {
      background: theme.calendarItemBackground,
    },
  },
  // Month/year heading
  '& [slot="title"]': {
    fontSize: 13,
    fontWeight: 600,
  },
  // The grid table
  '& table': {
    borderCollapse: 'collapse',
  },
  // Day-of-week headers
  '& th': {
    color: theme.calendarItemText,
    fontSize: 11,
    fontWeight: 'normal',
    padding: '4px 0',
    textAlign: 'center',
    width: 32,
  },
  // Day cells
  '& td': {
    padding: 0,
    textAlign: 'center',
  },
  '& td [role="button"]': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 4,
    fontSize: 12,
    cursor: 'pointer',
    border: 'none',
    background: theme.calendarItemBackground,
    color: theme.calendarItemText,
  },
  // Suppress browser default outline for mouse clicks (non-keyboard focus)
  '& td [role="button"]:focus:not(:focus-visible)': {
    outline: 'none',
  },
  // Today
  '& td [data-today] [role="button"], & td[data-today] [role="button"]': {
    textDecoration: 'underline',
  },
  // Selected date
  '& td[data-selected] [role="button"]': {
    backgroundColor: theme.calendarSelectedBackground,
    color: theme.calendarText,
    fontWeight: 600,
  },
  // Focused date (keyboard navigation highlight)
  '& td[data-focused] [role="button"]': {
    boxShadow: `0 0 0 2px ${theme.calendarSelectedBackground}`,
  },
  // Keyboard focus ring via :focus-visible (for keyboard users only)
  '& td [role="button"]:focus-visible': {
    boxShadow: `0 0 0 2px ${theme.calendarSelectedBackground}`,
  },
  // Outside-month dates
  '& td[data-outside-month] [role="button"]': {
    opacity: 0.4,
  },
  // Hover
  '& td [role="button"]:hover': {
    backgroundColor: theme.calendarSelectedBackground,
    opacity: 0.8,
  },
};

type DatePickerProps = {
  value: string;
  firstDayOfWeekIdx: string;
  dateFormat: string;
  onUpdate: (selectedDate: Date) => void;
  onSelect: (selectedDate: Date) => void;
};

type DatePickerForwardedRef = {
  handleInputKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
};
const DatePicker = forwardRef<DatePickerForwardedRef, DatePickerProps>(
  ({ value, firstDayOfWeekIdx, dateFormat, onUpdate, onSelect }, ref) => {
    const onUpdateEffect = useEffectEvent(onUpdate);
    const onSelectEffect = useEffectEvent(onSelect);

    // Parse the value string into a CalendarDate for react-aria
    const calendarValue = useMemo(() => {
      if (value) {
        const parsed = parse(value, dateFormat, currentDate());
        if (isValid(parsed)) {
          return toCalendarDate(parsed);
        }
      }
      return toCalendarDate(currentDate());
    }, [value, dateFormat]);

    // Track focused date separately for keyboard navigation from the input
    const [focusedDate, setFocusedDate] = useState<CalendarDate>(calendarValue);

    // Sync focused date when the calendar value changes (e.g. user types a date)
    useEffect(() => {
      setFocusedDate(calendarValue);
    }, [calendarValue]);

    useImperativeHandle(
      ref,
      () => ({
        handleInputKeyDown(e) {
          const jsDate = fromCalendarDate(focusedDate);

          let newDate = null;
          switch (e.key) {
            case 'ArrowLeft':
              e.preventDefault();
              newDate = subDays(jsDate, 1);
              break;
            case 'ArrowUp':
              e.preventDefault();
              newDate = subDays(jsDate, 7);
              break;
            case 'ArrowRight':
              e.preventDefault();
              newDate = addDays(jsDate, 1);
              break;
            case 'ArrowDown':
              e.preventDefault();
              newDate = addDays(jsDate, 7);
              break;
            default:
          }

          if (newDate) {
            const newCalDate = toCalendarDate(newDate);
            setFocusedDate(newCalDate);
            onUpdateEffect(newDate);
          }
        },
      }),
      [focusedDate, onUpdateEffect],
    );

    const firstDayOfWeek = FIRST_DAY_MAP[firstDayOfWeekIdx] || 'sun';

    return (
      <View className={css([calendarStyles, { flex: 1 }])}>
        <Calendar
          aria-label="Date picker"
          value={calendarValue}
          focusedValue={focusedDate}
          onFocusChange={setFocusedDate}
          onChange={cd => {
            onSelectEffect(fromCalendarDate(cd));
          }}
          firstDayOfWeek={firstDayOfWeek}
        >
          <header>
            <AriaButton slot="previous" aria-label="Previous month">
              &#9666;
            </AriaButton>
            <Heading slot="title" />
            <AriaButton slot="next" aria-label="Next month">
              &#9656;
            </AriaButton>
          </header>
          <CalendarGrid>
            <CalendarGridHeader>
              {day => <CalendarHeaderCell>{day}</CalendarHeaderCell>}
            </CalendarGridHeader>
            <CalendarGridBody>
              {date => <CalendarCell date={date} />}
            </CalendarGridBody>
          </CalendarGrid>
        </Calendar>
      </View>
    );
  },
);

DatePicker.displayName = 'DatePicker';

function defaultShouldSaveFromKey(e: KeyboardEvent<HTMLInputElement>) {
  return e.key === 'Enter';
}

type DateSelectProps = {
  id?: string;
  containerProps?: ComponentProps<typeof View>;
  inputProps?: ComponentProps<typeof Input>;
  value: string;
  isOpen?: boolean;
  embedded?: boolean;
  dateFormat: string;
  openOnFocus?: boolean;
  ref?: Ref<HTMLInputElement>;
  shouldSaveFromKey?: (e: KeyboardEvent<HTMLInputElement>) => boolean;
  clearOnBlur?: boolean;
  onUpdate?: (selectedDate: string) => void;
  onSelect: (selectedDate: string) => void;
};

function DateSelectDesktop({
  id,
  containerProps,
  inputProps,
  value: defaultValue,
  isOpen,
  embedded,
  dateFormat = 'yyyy-MM-dd',
  openOnFocus = true,
  ref,
  shouldSaveFromKey = defaultShouldSaveFromKey,
  clearOnBlur = true,
  onUpdate,
  onSelect,
}: DateSelectProps) {
  const parsedDefaultValue = useMemo(() => {
    if (defaultValue) {
      const date = parseISO(defaultValue);
      if (isValid(date)) {
        return format(date, dateFormat);
      }
    }
    return '';
  }, [defaultValue, dateFormat]);

  const picker = useRef<DatePickerForwardedRef | null>(null);
  const [value, setValue] = useState(parsedDefaultValue);
  const [open, setOpen] = useState(embedded || isOpen || false);
  const innerRef = useRef<HTMLInputElement | null>(null);
  const mergedRef = useMergedRefs<HTMLInputElement>(innerRef, ref);

  const [selectedValue, setSelectedValue] = useState(value);

  const [_firstDayOfWeekIdx] = useSyncedPref('firstDayOfWeekIdx');
  const firstDayOfWeekIdx = _firstDayOfWeekIdx || '0';

  useEffect(() => setValue(parsedDefaultValue), [parsedDefaultValue]);

  const onUpdateEffect = useEffectEvent((newValue: string) => {
    if (getDayMonthRegex(dateFormat).test(newValue)) {
      // Support only entering the month and day (4/5). This is complex
      // because of the various date formats - we need to derive
      // the right day/month format from it
      const test = parse(newValue, getDayMonthFormat(dateFormat), new Date());
      if (isValid(test)) {
        onUpdate?.(format(test, 'yyyy-MM-dd'));
        setSelectedValue(format(test, dateFormat));
      }
    } else if (getShortYearRegex(dateFormat).test(newValue)) {
      // Support entering the year as only two digits (4/5/19)
      const test = parse(newValue, getShortYearFormat(dateFormat), new Date());
      if (isValid(test)) {
        onUpdate?.(format(test, 'yyyy-MM-dd'));
        setSelectedValue(format(test, dateFormat));
      }
    } else {
      const test = parse(newValue, dateFormat, new Date());
      if (isValid(test)) {
        const date = format(test, 'yyyy-MM-dd');
        onUpdate?.(date);
        setSelectedValue(newValue);
      }
    }
  });

  useEffect(() => {
    onUpdateEffect(value);
  }, [value]);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) &&
      !e.shiftKey &&
      !e.metaKey &&
      !e.altKey &&
      open
    ) {
      picker.current?.handleInputKeyDown(e);
    } else if (e.key === 'Escape') {
      setValue(parsedDefaultValue);
      setSelectedValue(parsedDefaultValue);

      if (parsedDefaultValue === value) {
        if (open) {
          if (!embedded) {
            e.stopPropagation();
          }

          setOpen(false);
        }
      } else {
        setOpen(true);
        onUpdate?.(defaultValue);
      }
    } else if (shouldSaveFromKey(e)) {
      if (selectedValue) {
        setValue(selectedValue);
        const date = parse(selectedValue, dateFormat, new Date());
        onSelect(format(date, 'yyyy-MM-dd'));
      }

      setOpen(false);

      if (open && e.key === 'Enter') {
        // This stops the event from propagating up
        e.stopPropagation();
        e.preventDefault();
      }

      const { onKeyDown } = inputProps || {};
      onKeyDown?.(e);
    } else if (!open) {
      setOpen(true);
      if (innerRef.current) {
        innerRef.current.setSelectionRange(0, 10000);
      }
    }
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value);
  }

  const maybeWrapTooltip = (content: JSX.Element) => {
    if (embedded) {
      return open ? content : null;
    }

    return (
      <Popover
        triggerRef={innerRef}
        placement="bottom start"
        offset={2}
        isOpen={open}
        isNonModal
        onOpenChange={() => setOpen(false)}
        style={{ ...styles.popover, minWidth: 225 }}
        data-testid="date-select-tooltip"
      >
        {content}
      </Popover>
    );
  };

  return (
    <View {...containerProps}>
      <Input
        id={id}
        {...inputProps}
        ref={mergedRef}
        value={value}
        onPointerUp={() => {
          if (!embedded) {
            setOpen(true);
          }
        }}
        onKeyDown={onKeyDown}
        onChange={onChange}
        onFocus={e => {
          if (!embedded && openOnFocus) {
            setOpen(true);
          }
          inputProps?.onFocus?.(e);
        }}
        onBlur={e => {
          if (!embedded) {
            setOpen(false);
          }
          inputProps?.onBlur?.(e);

          if (clearOnBlur) {
            // If value is empty, that drives what gets selected.
            // Otherwise the input is reset to whatever is already
            // selected
            if (value === '') {
              setSelectedValue('');
              onSelect('');
            } else {
              setValue(selectedValue || '');

              const date = parse(selectedValue, dateFormat, new Date());
              if (date instanceof Date && !isNaN(date.valueOf())) {
                onSelect(format(date, 'yyyy-MM-dd'));
              }
            }
          }
        }}
      />
      {maybeWrapTooltip(
        <DatePicker
          ref={picker}
          value={selectedValue}
          firstDayOfWeekIdx={firstDayOfWeekIdx}
          dateFormat={dateFormat}
          onUpdate={date => {
            setSelectedValue(format(date, dateFormat));
            onUpdate?.(format(date, 'yyyy-MM-dd'));
          }}
          onSelect={date => {
            setValue(format(date, dateFormat));
            onSelect(format(date, 'yyyy-MM-dd'));
            setOpen(false);
          }}
        />,
      )}
    </View>
  );
}

function DateSelectMobile(props: DateSelectProps) {
  return (
    <InputField
      id={props.id}
      type="date"
      value={props.value ?? ''}
      onChange={event => {
        props.onSelect(event.target.value);
      }}
      style={{ height: 28 }}
      {...props.inputProps}
    />
  );
}

export function DateSelect(props: DateSelectProps) {
  const { isNarrowWidth } = useResponsive();

  if (isNarrowWidth) {
    return <DateSelectMobile {...props} />;
  }

  return <DateSelectDesktop {...props} />;
}
