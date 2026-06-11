import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Loader2, Shield, Search, Eye, User, Wifi, Calendar, Phone, MapPin, FileText, AlertTriangle, Ban, CheckCircle2, Clock, Briefcase, CreditCard } from "lucide-react";
import { format } from "date-fns";

function safeDate(val: any) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(val: any) {
  const d = safeDate(val);
  return d ? format(d, "MMM d, yyyy") : "—";
}

function fmtDateTime(val: any) {
  const d = safeDate(val);
  return d ? format(d, "MMM d, yyyy HH:mm") : "—";
}

function VerificationBadge({ status }: { status: string }) {
  if (status === "verified")
    return <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3 mr-1" />Verified</Badge>;
  if (status === "pending")
    return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
  if (status === "declined")
    return <Badge className="bg-red-100 text-red-700 border-red-200"><AlertTriangle className="w-3 h-3 mr-1" />Declined</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Unverified</Badge>;
}

function UserDetailModal({ user, onClose }: { user: any; onClose: () => void }) {
  const { data: detail, isLoading } = useQuery<any>({
    queryKey: ['/api/admin/security-records', user.id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/security-records/${user.id}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email || "Unknown";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarImage src={user.profile_picture_url || ""} />
              <AvatarFallback>{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <div className="font-bold text-foreground">{displayName}</div>
              <div className="text-sm text-muted-foreground font-normal">{user.email}</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {detail && (
          <div className="space-y-5 mt-2">
            {/* Identity Section */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <User className="w-4 h-4" />Identity & Account
              </h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div><span className="text-muted-foreground">Full Name</span><div className="font-medium text-foreground">{displayName}</div></div>
                <div><span className="text-muted-foreground">Email</span><div className="font-medium text-foreground">{user.email || "—"}</div></div>
                <div><span className="text-muted-foreground">Phone</span><div className="font-medium text-foreground">{user.phone_number || "—"}</div></div>
                <div><span className="text-muted-foreground">Location</span><div className="font-medium text-foreground">{user.location || "—"}</div></div>
                <div><span className="text-muted-foreground">Auth Method</span><div className="font-medium text-foreground capitalize">{user.auth_method || "—"}</div></div>
                <div><span className="text-muted-foreground">Account Created</span><div className="font-medium text-foreground">{fmtDateTime(user.created_at)}</div></div>
                <div><span className="text-muted-foreground">Verification</span><div className="mt-0.5"><VerificationBadge status={user.verification_status} /></div></div>
                <div>
                  <span className="text-muted-foreground">Account Status</span>
                  <div className="mt-0.5">
                    {user.is_suspended
                      ? <Badge className="bg-red-100 text-red-700 border-red-200"><Ban className="w-3 h-3 mr-1" />Suspended</Badge>
                      : <Badge className="bg-green-100 text-green-700 border-green-200">Active</Badge>
                    }
                  </div>
                </div>
                {Number(user.no_show_count) > 0 && (
                  <div><span className="text-muted-foreground">No-show Count</span><div className="font-medium text-red-600">{user.no_show_count}</div></div>
                )}
              </div>
            </div>

            <Separator />

            {/* Network / IP Section */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Wifi className="w-4 h-4" />Network Records
              </h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Registration IP</span>
                  <div className="font-mono font-medium text-foreground">{detail.user?.registration_ip || "—"}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Last Login IP</span>
                  <div className="font-mono font-medium text-foreground">{detail.user?.last_login_ip || "—"}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Last Seen</span>
                  <div className="font-medium text-foreground">{fmtDateTime(detail.user?.last_login_at)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Verification IP</span>
                  <div className="font-mono font-medium text-foreground">{detail.profile?.verification_ip || "—"}</div>
                </div>
                {detail.profile?.verification_submitted_at && (
                  <div>
                    <span className="text-muted-foreground">Verification Submitted</span>
                    <div className="font-medium text-foreground">{fmtDateTime(detail.profile?.verification_submitted_at)}</div>
                  </div>
                )}
              </div>
            </div>

            {/* ID Photos */}
            {(user.id_card_url || user.face_scan_url) && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />Identity Documents
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {user.id_card_url && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">ID Card</p>
                        <a href={user.id_card_url} target="_blank" rel="noopener noreferrer">
                          <img src={user.id_card_url} alt="ID Card" className="rounded-lg border border-border object-cover w-full max-h-44 cursor-zoom-in hover:opacity-90 transition-opacity" data-testid={`img-id-card-${user.id}`} />
                        </a>
                      </div>
                    )}
                    {user.face_scan_url && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Face Scan / Selfie</p>
                        <a href={user.face_scan_url} target="_blank" rel="noopener noreferrer">
                          <img src={user.face_scan_url} alt="Face Scan" className="rounded-lg border border-border object-cover w-full max-h-44 cursor-zoom-in hover:opacity-90 transition-opacity" data-testid={`img-face-scan-${user.id}`} />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Activity Summary */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Briefcase className="w-4 h-4" />Activity Summary
              </h3>
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-foreground">{detail.recentJobs?.filter((j: any) => j.poster_id === user.id).length ?? 0}</div>
                  <div className="text-xs text-muted-foreground mt-1">Jobs Posted</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-foreground">{detail.recentJobs?.filter((j: any) => j.poster_id !== user.id).length ?? 0}</div>
                  <div className="text-xs text-muted-foreground mt-1">Jobs Accepted</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-foreground">{detail.recentTransactions?.length ?? 0}</div>
                  <div className="text-xs text-muted-foreground mt-1">Transactions</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-foreground">{detail.recentDisputes?.length ?? 0}</div>
                  <div className="text-xs text-muted-foreground mt-1">Disputes</div>
                </div>
              </div>
            </div>

            {/* Recent Jobs */}
            {detail.recentJobs?.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Recent Jobs</h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {detail.recentJobs.slice(0, 10).map((j: any) => (
                      <div key={j.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                        <div>
                          <span className="font-medium text-foreground">{j.title}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{j.poster_id === user.id ? "Posted" : "Accepted"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{j.status}</Badge>
                          <span className="text-muted-foreground text-xs">₦{Number(j.price).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Recent Transactions */}
            {detail.recentTransactions?.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />Recent Transactions
                  </h3>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {detail.recentTransactions.slice(0, 10).map((t: any) => (
                      <div key={t.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                        <div>
                          <span className="font-medium text-foreground capitalize">{t.type?.replace(/_/g, " ")}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{fmtDate(t.created_at)}</span>
                        </div>
                        <span className={`font-semibold ${Number(t.amount) >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {Number(t.amount) >= 0 ? "+" : ""}₦{Math.abs(Number(t.amount)).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AdminSecurityRecords() {
  const { user } = useAuth();
  const { isStaff } = useAdminAuth();
  const isOwner = user?.email?.toLowerCase() === "abeebakeem265@gmail.com";

  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const { data: records = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/security-records", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/security-records?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isOwner,
  });

  const filtered = records.filter((r) => {
    if (statusFilter === "verified") return r.verification_status === "verified";
    if (statusFilter === "pending") return r.verification_status === "pending";
    if (statusFilter === "unverified") return r.verification_status === "unverified" || !r.verification_status;
    if (statusFilter === "suspended") return r.is_suspended;
    return true;
  });

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2 text-foreground">Access Denied</h2>
          <p className="text-muted-foreground">Owner access required to view security records.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3" data-testid="text-security-records-title">
            <Shield className="w-8 h-8 text-primary" />
            Security Records
          </h1>
          <p className="text-muted-foreground mt-1">Full identity, IP, and activity records for all users — for investigation purposes.</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex gap-2 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, phone, location…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") setSearch(searchInput); }}
                className="pl-9"
                data-testid="input-security-search"
              />
            </div>
            <Button onClick={() => setSearch(searchInput)} variant="secondary" data-testid="button-search-submit">Search</Button>
            {search && <Button variant="ghost" onClick={() => { setSearch(""); setSearchInput(""); }}>Clear</Button>}
          </div>

          {/* Status filter */}
          <div className="flex gap-1.5 flex-wrap">
            {["all", "verified", "pending", "unverified", "suspended"].map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(s)}
                data-testid={`button-filter-${s}`}
                className="capitalize"
              >
                {s}
              </Button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Users", value: records.length, color: "text-foreground" },
            { label: "Verified", value: records.filter(r => r.verification_status === "verified").length, color: "text-green-600" },
            { label: "Pending Review", value: records.filter(r => r.verification_status === "pending").length, color: "text-yellow-600" },
            { label: "Suspended", value: records.filter(r => r.is_suspended).length, color: "text-red-600" },
          ].map((stat) => (
            <Card key={stat.label} className="border border-border">
              <CardContent className="p-4 text-center">
                <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No users found{search ? " matching your search" : ""}.</p>
          </div>
        ) : (
          <Card className="border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">User</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Contact</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Network</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Activity</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Joined</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((record, i) => {
                    const fullName = [record.first_name, record.last_name].filter(Boolean).join(" ") || "—";
                    return (
                      <tr
                        key={record.id}
                        className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
                        data-testid={`row-user-${record.id}`}
                      >
                        {/* User */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="w-8 h-8 flex-shrink-0">
                              <AvatarImage src={record.profile_picture_url || ""} />
                              <AvatarFallback className="text-xs">{fullName.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-foreground">{fullName}</div>
                              <div className="text-xs text-muted-foreground">{record.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Contact */}
                        <td className="px-4 py-3">
                          <div className="text-xs space-y-0.5">
                            {record.phone_number && (
                              <div className="flex items-center gap-1 text-foreground">
                                <Phone className="w-3 h-3 text-muted-foreground" />{record.phone_number}
                              </div>
                            )}
                            {record.location && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <MapPin className="w-3 h-3" />{record.location}
                              </div>
                            )}
                            {!record.phone_number && !record.location && <span className="text-muted-foreground">—</span>}
                          </div>
                        </td>

                        {/* Network */}
                        <td className="px-4 py-3">
                          <div className="text-xs font-mono space-y-0.5">
                            <div className="text-foreground">{record.registration_ip || <span className="text-muted-foreground not-italic font-sans">No IP</span>}</div>
                            {record.last_login_at && (
                              <div className="text-muted-foreground not-italic font-sans">Last: {fmtDate(record.last_login_at)}</div>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <VerificationBadge status={record.verification_status} />
                            {record.is_suspended && (
                              <div><Badge className="bg-red-100 text-red-700 border-red-200 text-xs"><Ban className="w-3 h-3 mr-1" />Suspended</Badge></div>
                            )}
                            {Number(record.no_show_count) > 0 && (
                              <div className="text-xs text-orange-600 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />{record.no_show_count} no-show{Number(record.no_show_count) !== 1 ? "s" : ""}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Activity */}
                        <td className="px-4 py-3">
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            <div>{record.jobs_posted ?? 0} posted · {record.jobs_accepted ?? 0} accepted</div>
                            <div>{record.transactions_count ?? 0} txns · {record.disputes_count ?? 0} disputes</div>
                            <div className="capitalize text-foreground">{record.auth_method || "—"} auth</div>
                          </div>
                        </td>

                        {/* Joined */}
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(record.created_at)}
                        </td>

                        {/* Action */}
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedUser(record)}
                            data-testid={`button-view-${record.id}`}
                          >
                            <Eye className="w-4 h-4 mr-1" />View
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>

      {selectedUser && (
        <UserDetailModal user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  );
}
