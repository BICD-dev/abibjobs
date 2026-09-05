import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, Clock, User, CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";

interface AdminHoursResponse {
  hours: { date: string; secondsWorked: number }[];
  totalSeconds: number;
  admin: {
    id: number;
    name: string;
    email: string;
  };
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export default function AdminProfile() {
  const { isStaff, isLoading: authLoading } = useAdminAuth();

  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [rangeFrom, setRangeFrom] = useState<Date | null>(null);
  const [rangeTo, setRangeTo] = useState<Date | null>(null);
  const [rangeFromOpen, setRangeFromOpen] = useState(false);
  const [rangeToOpen, setRangeToOpen] = useState(false);

  const { data: hoursData, isLoading } = useQuery<AdminHoursResponse>({
    queryKey: ["/api/admin/my-hours"],
    queryFn: async () => {
      const res = await fetch("/api/admin/my-hours", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch hours");
      return res.json();
    },
    enabled: !!isStaff,
  });

  const rangeResult = useMemo(() => {
    if (!rangeFrom || !rangeTo || !hoursData?.hours) return null;
    const start = rangeFrom < rangeTo ? rangeFrom : rangeTo;
    const end = rangeFrom < rangeTo ? rangeTo : rangeFrom;
    const filtered = hoursData.hours.filter(h => {
      const d = new Date(h.date + 'T00:00:00');
      return d >= start && d <= end;
    });
    const totalSeconds = filtered.reduce((sum, h) => sum + h.secondsWorked, 0);
    return { totalSeconds, daysWorked: filtered.length, hours: filtered, start, end };
  }, [rangeFrom, rangeTo, hoursData]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2 text-foreground">Access Denied</h2>
          <p className="text-muted-foreground">Staff admin access required.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-profile-title">My Profile</h1>
            <p className="text-sm text-muted-foreground">{hoursData?.admin?.name || "Admin"} &middot; {hoursData?.admin?.email || ""}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            <Card data-testid="card-my-hours">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-4 h-4 text-blue-500" />
                  </div>
                  <CardTitle className="text-lg">My Work Hours</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="p-4 rounded-xl bg-muted/30 mb-4">
                  <p className="text-sm text-muted-foreground mb-1">Total Time Worked</p>
                  <p className="text-3xl font-bold text-foreground" data-testid="text-my-total-hours">
                    {formatDuration(hoursData?.totalSeconds || 0)}
                  </p>
                </div>

                {(() => {
                  const hoursMap = new Map<string, number>();
                  hoursData?.hours?.forEach(h => hoursMap.set(h.date, h.secondsWorked));

                  const workedDates = hoursData?.hours?.map(h => new Date(h.date + 'T00:00:00')) || [];

                  const monthStart = startOfMonth(calendarMonth);
                  const monthEnd = endOfMonth(calendarMonth);
                  const monthHours = hoursData?.hours?.filter(h => {
                    const d = new Date(h.date + 'T00:00:00');
                    return d >= monthStart && d <= monthEnd;
                  }) || [];
                  const monthTotalSeconds = monthHours.reduce((sum, h) => sum + h.secondsWorked, 0);
                  const daysWorkedThisMonth = monthHours.length;

                  const selectedDateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
                  const selectedDayHours = selectedDateStr ? hoursMap.get(selectedDateStr) : undefined;

                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-4 mb-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setCalendarMonth(prev => subMonths(prev, 1))}
                          data-testid="button-prev-month"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <p className="text-sm font-semibold text-foreground" data-testid="text-calendar-month">
                          {format(calendarMonth, "MMMM yyyy")}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setCalendarMonth(prev => addMonths(prev, 1))}
                          data-testid="button-next-month"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="flex justify-center">
                        <Calendar
                          mode="single"
                          month={calendarMonth}
                          onMonthChange={setCalendarMonth}
                          selected={selectedDate || undefined}
                          onSelect={(d) => setSelectedDate(d || null)}
                          modifiers={{
                            worked: workedDates,
                          }}
                          modifiersClassNames={{
                            worked: "bg-primary/20 text-primary font-bold",
                          }}
                          data-testid="calendar-hours"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl bg-muted/30 text-center">
                          <p className="text-xs text-muted-foreground mb-0.5">Days Worked</p>
                          <p className="text-lg font-bold text-foreground" data-testid="text-days-worked">{daysWorkedThisMonth}</p>
                          <p className="text-[10px] text-muted-foreground">this month</p>
                        </div>
                        <div className="p-3 rounded-xl bg-muted/30 text-center">
                          <p className="text-xs text-muted-foreground mb-0.5">Monthly Hours</p>
                          <p className="text-lg font-bold text-foreground" data-testid="text-month-hours">{formatDuration(monthTotalSeconds)}</p>
                          <p className="text-[10px] text-muted-foreground">{format(calendarMonth, "MMM yyyy")}</p>
                        </div>
                      </div>

                      {selectedDate && (
                        <div className="p-3 rounded-xl border border-primary/20 bg-primary/5" data-testid="card-selected-day">
                          <p className="text-sm font-medium text-foreground mb-1">
                            {format(selectedDate, "EEEE, MMMM d, yyyy")}
                          </p>
                          {selectedDayHours ? (
                            <p className="text-sm text-primary font-semibold" data-testid="text-selected-day-hours">
                              Worked {formatDuration(selectedDayHours)}
                            </p>
                          ) : (
                            <p className="text-sm text-muted-foreground">No hours recorded</p>
                          )}
                        </div>
                      )}

                      {monthHours.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">Daily Breakdown</p>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {monthHours.sort((a, b) => b.date.localeCompare(a.date)).map((h) => (
                              <div key={h.date} className="flex items-center justify-between gap-4 p-2 rounded-lg" data-testid={`row-hours-${h.date}`}>
                                <span className="text-sm text-foreground">{format(new Date(h.date + 'T00:00:00'), "MMM d, yyyy (EEE)")}</span>
                                <span className="text-sm font-medium text-foreground">{formatDuration(h.secondsWorked)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="mt-6 pt-4 border-t space-y-4">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-primary" />
                    <p className="text-sm font-semibold text-foreground">Custom Date Range</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Pick a start and end date to see total hours worked in that period</p>

                  <div className="flex items-center gap-3 flex-wrap">
                    <Popover open={rangeFromOpen} onOpenChange={setRangeFromOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="justify-start text-left font-normal min-w-[150px]" data-testid="button-range-from">
                          <CalendarIcon className="w-4 h-4 mr-2 flex-shrink-0" />
                          {rangeFrom ? format(rangeFrom, "MMM d, yyyy") : "Start date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={rangeFrom || undefined}
                          onSelect={(d) => { setRangeFrom(d || null); setRangeFromOpen(false); }}
                          data-testid="calendar-range-from"
                        />
                      </PopoverContent>
                    </Popover>

                    <span className="text-sm text-muted-foreground">to</span>

                    <Popover open={rangeToOpen} onOpenChange={setRangeToOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="justify-start text-left font-normal min-w-[150px]" data-testid="button-range-to">
                          <CalendarIcon className="w-4 h-4 mr-2 flex-shrink-0" />
                          {rangeTo ? format(rangeTo, "MMM d, yyyy") : "End date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={rangeTo || undefined}
                          onSelect={(d) => { setRangeTo(d || null); setRangeToOpen(false); }}
                          data-testid="calendar-range-to"
                        />
                      </PopoverContent>
                    </Popover>

                    {(rangeFrom || rangeTo) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setRangeFrom(null); setRangeTo(null); }}
                        data-testid="button-clear-range"
                      >
                        Clear
                      </Button>
                    )}
                  </div>

                  {rangeResult && (
                    <div className="space-y-3">
                      <div className="p-4 rounded-xl bg-primary/5 border border-primary/20" data-testid="card-range-result">
                        <p className="text-xs text-muted-foreground mb-1">
                          {format(rangeResult.start, "MMM d, yyyy")} &mdash; {format(rangeResult.end, "MMM d, yyyy")}
                        </p>
                        <p className="text-2xl font-bold text-foreground" data-testid="text-range-total-hours">
                          {formatDuration(rangeResult.totalSeconds)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1" data-testid="text-range-days-worked">
                          {rangeResult.daysWorked} day{rangeResult.daysWorked !== 1 ? "s" : ""} worked
                        </p>
                      </div>

                      {rangeResult.hours.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">Breakdown</p>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {[...rangeResult.hours].sort((a, b) => b.date.localeCompare(a.date)).map((h) => (
                              <div key={h.date} className="flex items-center justify-between gap-4 p-2 rounded-lg" data-testid={`row-range-hours-${h.date}`}>
                                <span className="text-sm text-foreground">{format(new Date(h.date + 'T00:00:00'), "MMM d, yyyy (EEE)")}</span>
                                <span className="text-sm font-medium text-foreground">{formatDuration(h.secondsWorked)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {rangeFrom && rangeTo && !rangeResult?.hours.length && (
                    <p className="text-sm text-muted-foreground text-center py-3">No hours recorded in this date range</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
