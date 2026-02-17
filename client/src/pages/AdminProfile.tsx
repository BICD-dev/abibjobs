import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, Clock, Building2, CreditCard, Check, User, CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useToast } from "@/hooks/use-toast";
import { NIGERIAN_BANKS } from "@/lib/nigerian-banks";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths } from "date-fns";

interface AdminHoursResponse {
  hours: { date: string; secondsWorked: number }[];
  totalSeconds: number;
  admin: {
    id: number;
    name: string;
    email: string;
    bankName: string | null;
    bankCode: string | null;
    accountNumber: string | null;
    accountName: string | null;
  };
}

interface AdminPaymentRecord {
  id: number;
  adminId: number;
  amount: string;
  periodStart: string | null;
  periodEnd: string | null;
  hoursWorked: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  status: string;
  note: string | null;
  createdAt: string;
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatNaira(amount: string | number) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(num);
}

export default function AdminProfile() {
  const { isStaff, isLoading: authLoading } = useAdminAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [bankName, setBankName] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const { data: hoursData, isLoading } = useQuery<AdminHoursResponse>({
    queryKey: ["/api/admin/my-hours"],
    queryFn: async () => {
      const res = await fetch("/api/admin/my-hours", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch hours");
      return res.json();
    },
    enabled: !!isStaff,
  });

  const { data: payments, isLoading: paymentsLoading } = useQuery<AdminPaymentRecord[]>({
    queryKey: ["/api/admin/my-payments"],
    queryFn: async () => {
      const res = await fetch("/api/admin/my-payments", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!isStaff,
  });

  const bankMutation = useMutation({
    mutationFn: async (data: { bankName: string; bankCode: string; accountNumber: string; accountName: string }) => {
      const res = await fetch("/api/admin/my-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/my-hours"] });
      toast({ title: "Bank Account Updated", description: "Your salary account has been saved." });
      setIsEditing(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const hasBankSetup = hoursData?.admin?.bankName && hoursData?.admin?.accountNumber;

  const initEditForm = () => {
    if (hoursData?.admin) {
      setBankName(hoursData.admin.bankName || "");
      setBankCode(hoursData.admin.bankCode || "");
      setAccountNumber(hoursData.admin.accountNumber || "");
      setAccountName(hoursData.admin.accountName || "");
    }
    setIsEditing(true);
  };

  const handleBankSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName || !accountNumber || !accountName) {
      toast({ title: "Missing Info", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    bankMutation.mutate({ bankName, bankCode, accountNumber, accountName });
  };

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
              </CardContent>
            </Card>

            <Card data-testid="card-bank-account">
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-green-500" />
                    </div>
                    <CardTitle className="text-lg">Salary Account</CardTitle>
                  </div>
                  {hasBankSetup && !isEditing && (
                    <Button variant="outline" size="sm" onClick={initEditForm} data-testid="button-edit-bank">
                      Change
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!hasBankSetup && !isEditing ? (
                  <div className="text-center py-6">
                    <Building2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-4">No salary account set up yet</p>
                    <Button onClick={() => setIsEditing(true)} data-testid="button-setup-bank">
                      Set Up Salary Account
                    </Button>
                  </div>
                ) : isEditing ? (
                  <form onSubmit={handleBankSubmit} className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Bank Name</label>
                      <Select
                        value={bankCode}
                        onValueChange={(val) => {
                          setBankCode(val);
                          const bank = NIGERIAN_BANKS.find(b => b.code === val);
                          if (bank) setBankName(bank.name);
                        }}
                      >
                        <SelectTrigger data-testid="select-bank-name">
                          <SelectValue placeholder="Select your bank" />
                        </SelectTrigger>
                        <SelectContent>
                          {NIGERIAN_BANKS.map((bank) => (
                            <SelectItem key={bank.code} value={bank.code}>
                              {bank.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Account Number</label>
                      <Input
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        placeholder="0123456789"
                        maxLength={10}
                        data-testid="input-account-number"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Account Name</label>
                      <Input
                        value={accountName}
                        onChange={(e) => setAccountName(e.target.value)}
                        placeholder="Your account name"
                        data-testid="input-account-name"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" disabled={bankMutation.isPending} data-testid="button-save-bank">
                        {bankMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Save Account
                      </Button>
                      {hasBankSetup && (
                        <Button type="button" variant="outline" onClick={() => setIsEditing(false)} data-testid="button-cancel-bank">
                          Cancel
                        </Button>
                      )}
                    </div>
                  </form>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/30">
                      <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground" data-testid="text-bank-name">{hoursData?.admin?.bankName}</p>
                        <p className="text-sm text-muted-foreground" data-testid="text-account-number">{hoursData?.admin?.accountNumber}</p>
                        <p className="text-xs text-muted-foreground" data-testid="text-account-name">{hoursData?.admin?.accountName}</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-payment-history">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                    <CreditCard className="w-4 h-4 text-purple-500" />
                  </div>
                  <CardTitle className="text-lg">Payment History</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {paymentsLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : payments && payments.length > 0 ? (
                  <div className="space-y-2">
                    {payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-muted/20" data-testid={`row-payment-${p.id}`}>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{formatNaira(p.amount)}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.createdAt ? format(new Date(p.createdAt), "MMM d, yyyy") : ""}
                            {p.note ? ` · ${p.note}` : ""}
                          </p>
                        </div>
                        <span className="text-xs font-medium text-green-600 bg-green-500/10 px-2 py-1 rounded-md">{p.status}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">No payments received yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
