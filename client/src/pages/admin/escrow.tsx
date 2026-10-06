import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Shield, AlertTriangle, CheckCircle, XCircle, Bitcoin, Wallet, ArrowUpRight, Send, Zap } from "lucide-react";
import { useState } from "react";

interface AdminSetting {
  key: string;
  value: string;
  description: string | null;
}

interface EscrowOrder {
  id: string;
  orderId: string;
  buyerId: string;
  merchantId: string;
  btcAmount: number;
  cryptoAmount?: number;
  coinSymbol?: string;
  usdAmount: string;
  depositAddress: string;
  status: string;
  escrowStartedAt: string | null;
  escrowExpiresAt: string | null;
  createdAt: string;
  buyer?: { id: string; username: string };
  merchant?: { id: string; username: string };
}

interface Dispute {
  id: string;
  escrowOrderId: string;
  buyerId: string;
  merchantId: string;
  reason: string;
  evidenceDescription: string | null;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  buyer?: { id: string; username: string };
  merchant?: { id: string; username: string };
  escrow?: EscrowOrder;
}

interface WithdrawalRequest {
  id: string;
  merchantId: string;
  btcAmount: number;
  bnbAmount?: number;
  coinSymbol?: string;
  btcAddress: string;
  bnbAddress?: string;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  merchant?: { id: string; username: string };
}

export default function AdminEscrow() {
  const { toast } = useToast();
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRequest | null>(null);
  const [selectedEscrow, setSelectedEscrow] = useState<EscrowOrder | null>(null);
  const [adminNotes, setAdminNotes] = useState("");

  const { data: escrowOrders, isLoading: escrowLoading } = useQuery<EscrowOrder[]>({
    queryKey: ["/api/admin/escrow"],
  });

  const { data: disputes, isLoading: disputesLoading } = useQuery<Dispute[]>({
    queryKey: ["/api/admin/disputes"],
  });

  const { data: withdrawals, isLoading: withdrawalsLoading } = useQuery<WithdrawalRequest[]>({
    queryKey: ["/api/admin/withdrawals"],
  });

  const { data: autoApproveSetting, refetch: refetchAutoApprove } = useQuery<AdminSetting>({
    queryKey: ["/api/admin/settings/auto_approve_withdrawals"],
    queryFn: async () => {
      const res = await fetch("/api/admin/settings/auto_approve_withdrawals", { credentials: "include" });
      if (!res.ok) return { key: "auto_approve_withdrawals", value: "false", description: null };
      return res.json();
    },
  });

  const toggleAutoApproveMutation = useMutation({
    mutationFn: async () => {
      const newValue = autoApproveSetting?.value === "true" ? "false" : "true";
      return apiRequest("POST", "/api/admin/settings", { 
        key: "auto_approve_withdrawals",
        value: newValue,
        description: "When enabled, withdrawal requests are automatically approved and crypto is sent to merchant wallet"
      });
    },
    onSuccess: () => {
      toast({ 
        title: "Setting updated", 
        description: autoApproveSetting?.value === "true" 
          ? "Auto-approve withdrawals disabled" 
          : "Auto-approve withdrawals enabled - crypto will be sent automatically"
      });
      refetchAutoApprove();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update setting", variant: "destructive" });
    },
  });

  const refundMutation = useMutation({
    mutationFn: async (disputeId: string) => {
      return apiRequest("POST", `/api/admin/disputes/${disputeId}/refund`, { adminNotes, sendRealCrypto: true });
    },
    onSuccess: () => {
      toast({ title: "Dispute resolved", description: "Refund sent to buyer's wallet address" });
      setSelectedDispute(null);
      setAdminNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/disputes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/escrow"] });
      queryClient.invalidateQueries({ queryKey: ["/api/escrow/buyer"] });
      queryClient.invalidateQueries({ queryKey: ["/api/escrow/merchant"] });
      queryClient.invalidateQueries({ queryKey: ["/api/disputes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to process refund", variant: "destructive" });
    },
  });

  const releaseMutation = useMutation({
    mutationFn: async (disputeId: string) => {
      return apiRequest("POST", `/api/admin/disputes/${disputeId}/release`, { adminNotes });
    },
    onSuccess: () => {
      toast({ title: "Dispute resolved", description: "Funds released to merchant" });
      setSelectedDispute(null);
      setAdminNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/disputes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/escrow"] });
      queryClient.invalidateQueries({ queryKey: ["/api/escrow/buyer"] });
      queryClient.invalidateQueries({ queryKey: ["/api/escrow/merchant"] });
      queryClient.invalidateQueries({ queryKey: ["/api/disputes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to release funds", variant: "destructive" });
    },
  });

  const approveWithdrawalMutation = useMutation({
    mutationFn: async (withdrawalId: string) => {
      return apiRequest("POST", `/api/admin/withdrawals/${withdrawalId}/approve`, { adminNotes, sendRealCrypto: true });
    },
    onSuccess: () => {
      toast({ title: "Withdrawal approved", description: "Crypto sent to merchant" });
      setSelectedWithdrawal(null);
      setAdminNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawals"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to approve withdrawal", variant: "destructive" });
    },
  });

  const rejectWithdrawalMutation = useMutation({
    mutationFn: async (withdrawalId: string) => {
      return apiRequest("POST", `/api/admin/withdrawals/${withdrawalId}/reject`, { adminNotes });
    },
    onSuccess: () => {
      toast({ title: "Withdrawal rejected", description: "Funds returned to merchant wallet" });
      setSelectedWithdrawal(null);
      setAdminNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawals"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reject withdrawal", variant: "destructive" });
    },
  });

  const releaseEscrowMutation = useMutation({
    mutationFn: async (escrowId: string) => {
      return apiRequest("POST", `/api/admin/escrow/${escrowId}/release`, { adminNotes });
    },
    onSuccess: () => {
      toast({ title: "Escrow released", description: "Funds released to merchant wallet" });
      setSelectedEscrow(null);
      setAdminNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/escrow"] });
      queryClient.invalidateQueries({ queryKey: ["/api/escrow/buyer"] });
      queryClient.invalidateQueries({ queryKey: ["/api/escrow/merchant"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to release escrow", variant: "destructive" });
    },
  });

  const approveAllWithdrawalsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/admin/withdrawals/approve-all`, {});
    },
    onSuccess: (data: { approvedCount: number; message: string }) => {
      toast({ title: "Success", description: data.message || `Approved ${data.approvedCount} withdrawals` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawals"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to approve withdrawals", variant: "destructive" });
    },
  });

  const openDisputes = disputes?.filter(d => d.status === "open") || [];
  const pendingWithdrawals = withdrawals?.filter(w => w.status === "pending") || [];
  const activeEscrows = escrowOrders?.filter(e => e.status === "escrow" || e.status === "disputed") || [];

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      pending_payment: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
      escrow: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
      released: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
      disputed: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
      refunded: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
      open: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
      resolved_refund: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
      resolved_release: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
      pending: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
      completed: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
      rejected: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
    };
    return <Badge variant="outline" className={variants[status] || ""}>{status.replace(/_/g, " ")}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="h-8 w-8 text-primary" />
          Escrow Management
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage Bitcoin escrows, disputes, and withdrawals
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Escrows</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2" data-testid="text-active-escrows">
              <Bitcoin className="h-5 w-5 text-orange-500" />
              {activeEscrows.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open Disputes</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2 text-red-600" data-testid="text-open-disputes">
              <AlertTriangle className="h-5 w-5" />
              {openDisputes.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending Withdrawals</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2 text-yellow-600" data-testid="text-pending-withdrawals">
              <Wallet className="h-5 w-5" />
              {pendingWithdrawals.length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="disputes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="disputes" data-testid="tab-disputes">
            Disputes {openDisputes.length > 0 && <Badge variant="destructive" className="ml-2">{openDisputes.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="withdrawals" data-testid="tab-withdrawals">
            Withdrawals {pendingWithdrawals.length > 0 && <Badge variant="secondary" className="ml-2">{pendingWithdrawals.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="escrows" data-testid="tab-escrows">All Escrows</TabsTrigger>
        </TabsList>

        <TabsContent value="disputes">
          <Card>
            <CardHeader>
              <CardTitle>Dispute Resolution</CardTitle>
              <CardDescription>Review and resolve buyer disputes</CardDescription>
            </CardHeader>
            <CardContent>
              {disputesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : disputes && disputes.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Buyer</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {disputes.map((dispute) => (
                      <TableRow key={dispute.id}>
                        <TableCell className="font-mono">#{dispute.escrow?.orderId.substring(0, 8)}</TableCell>
                        <TableCell>{dispute.buyer?.username}</TableCell>
                        <TableCell>{dispute.merchant?.username}</TableCell>
                        <TableCell className="font-mono">
                          {(dispute.escrow?.cryptoAmount || dispute.escrow?.btcAmount || 0).toFixed(dispute.escrow?.coinSymbol === "BNB" ? 6 : 8)} {dispute.escrow?.coinSymbol || "BTC"}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{dispute.reason}</TableCell>
                        <TableCell>{getStatusBadge(dispute.status)}</TableCell>
                        <TableCell>
                          {dispute.status === "open" && (
                            <Button size="sm" onClick={() => { setSelectedDispute(dispute); setAdminNotes(""); }} data-testid={`button-resolve-dispute-${dispute.id}`}>
                              Resolve
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">No disputes</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="withdrawals">
          <Card className="mb-4">
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-yellow-100 dark:bg-yellow-900">
                  <Zap className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Auto-Approve Withdrawals</CardTitle>
                  <CardDescription className="text-sm">
                    Automatically approve and send crypto when merchants request withdrawals
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={autoApproveSetting?.value === "true" ? "default" : "secondary"}>
                  {autoApproveSetting?.value === "true" ? "Enabled" : "Disabled"}
                </Badge>
                <Switch
                  checked={autoApproveSetting?.value === "true"}
                  onCheckedChange={() => toggleAutoApproveMutation.mutate()}
                  disabled={toggleAutoApproveMutation.isPending}
                  data-testid="switch-auto-approve-withdrawals"
                />
              </div>
            </CardHeader>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Withdrawal Requests</CardTitle>
                <CardDescription>Approve or reject merchant withdrawal requests</CardDescription>
              </div>
              {pendingWithdrawals.length > 0 && (
                <Button
                  onClick={() => approveAllWithdrawalsMutation.mutate()}
                  disabled={approveAllWithdrawalsMutation.isPending}
                  data-testid="button-approve-all-withdrawals"
                >
                  {approveAllWithdrawalsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Approve All ({pendingWithdrawals.length})
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {withdrawalsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : withdrawals && withdrawals.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {withdrawals.map((w) => (
                      <TableRow key={w.id}>
                        <TableCell>{w.merchant?.username}</TableCell>
                        <TableCell className="font-mono">
                            {(w.coinSymbol === "BNB" ? (w.bnbAmount || 0) : w.btcAmount).toFixed(w.coinSymbol === "BNB" ? 6 : 8)} {w.coinSymbol || "BTC"}
                          </TableCell>
                        <TableCell className="font-mono text-xs max-w-[150px] truncate">
                            {w.coinSymbol === "BNB" ? w.bnbAddress : w.btcAddress}
                          </TableCell>
                        <TableCell>{getStatusBadge(w.status)}</TableCell>
                        <TableCell>{new Date(w.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {w.status === "pending" && (
                            <Button size="sm" onClick={() => { setSelectedWithdrawal(w); setAdminNotes(""); }} data-testid={`button-review-withdrawal-${w.id}`}>
                              Review
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">No withdrawals</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="escrows">
          <Card>
            <CardHeader>
              <CardTitle>All Escrow Orders</CardTitle>
              <CardDescription>Complete escrow order history</CardDescription>
            </CardHeader>
            <CardContent>
              {escrowLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : escrowOrders && escrowOrders.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Buyer</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>USD Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {escrowOrders.map((escrow) => (
                      <TableRow key={escrow.id}>
                        <TableCell className="font-mono">#{escrow.orderId.substring(0, 8)}</TableCell>
                        <TableCell>{escrow.buyer?.username}</TableCell>
                        <TableCell>{escrow.merchant?.username}</TableCell>
                        <TableCell className="font-mono">
                          {(escrow.cryptoAmount || escrow.btcAmount).toFixed(escrow.coinSymbol === "BNB" ? 6 : 8)} {escrow.coinSymbol || "BTC"}
                        </TableCell>
                        <TableCell>${parseFloat(escrow.usdAmount).toFixed(2)}</TableCell>
                        <TableCell>{getStatusBadge(escrow.status)}</TableCell>
                        <TableCell>{new Date(escrow.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {escrow.status === "escrow" && (
                            <Button 
                              size="sm" 
                              onClick={() => { setSelectedEscrow(escrow); setAdminNotes(""); }}
                              data-testid={`button-release-escrow-${escrow.id}`}
                            >
                              <Send className="h-3 w-3 mr-1" />
                              Release
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">No escrow orders</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedDispute} onOpenChange={(open) => !open && setSelectedDispute(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Resolve Dispute</DialogTitle>
            <DialogDescription>
              Review the dispute and decide the outcome
            </DialogDescription>
          </DialogHeader>
          {selectedDispute && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Buyer</p>
                  <p className="font-medium">{selectedDispute.buyer?.username}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Merchant</p>
                  <p className="font-medium">{selectedDispute.merchant?.username}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Amount</p>
                  <p className="font-mono font-medium">
                    {(selectedDispute.escrow?.cryptoAmount || selectedDispute.escrow?.btcAmount || 0).toFixed(selectedDispute.escrow?.coinSymbol === "BNB" ? 6 : 8)} {selectedDispute.escrow?.coinSymbol || "BTC"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">USD Value</p>
                  <p className="font-medium">${parseFloat(selectedDispute.escrow?.usdAmount || "0").toFixed(2)}</p>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Dispute Reason:</p>
                <p className="p-3 bg-muted rounded-md">{selectedDispute.reason}</p>
              </div>
              {selectedDispute.evidenceDescription && (
                <div>
                  <p className="text-muted-foreground text-sm">Evidence:</p>
                  <p className="p-3 bg-muted rounded-md">{selectedDispute.evidenceDescription}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Admin Notes (optional)</p>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add notes about your decision..."
                  data-testid="input-admin-notes"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSelectedDispute(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => selectedDispute && refundMutation.mutate(selectedDispute.id)}
              disabled={refundMutation.isPending}
              data-testid="button-refund-buyer"
            >
              {refundMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
              Refund Buyer
            </Button>
            <Button
              onClick={() => selectedDispute && releaseMutation.mutate(selectedDispute.id)}
              disabled={releaseMutation.isPending}
              data-testid="button-release-merchant"
            >
              {releaseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Release to Merchant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedWithdrawal} onOpenChange={(open) => !open && setSelectedWithdrawal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Withdrawal</DialogTitle>
            <DialogDescription>
              Approve or reject this withdrawal request
            </DialogDescription>
          </DialogHeader>
          {selectedWithdrawal && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Merchant</p>
                  <p className="font-medium">{selectedWithdrawal.merchant?.username}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Amount</p>
                  <p className="font-mono font-medium">
                    {(selectedWithdrawal.coinSymbol === "BNB" ? (selectedWithdrawal.bnbAmount || 0) : selectedWithdrawal.btcAmount).toFixed(selectedWithdrawal.coinSymbol === "BNB" ? 6 : 8)} {selectedWithdrawal.coinSymbol || "BTC"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">{selectedWithdrawal.coinSymbol || "BTC"} Address:</p>
                <p className="p-3 bg-muted rounded-md font-mono text-xs break-all">
                  {selectedWithdrawal.coinSymbol === "BNB" ? selectedWithdrawal.bnbAddress : selectedWithdrawal.btcAddress}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">Admin Notes (optional)</p>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add notes..."
                  data-testid="input-withdrawal-notes"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSelectedWithdrawal(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => selectedWithdrawal && rejectWithdrawalMutation.mutate(selectedWithdrawal.id)}
              disabled={rejectWithdrawalMutation.isPending}
              data-testid="button-reject-withdrawal"
            >
              {rejectWithdrawalMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
              Reject
            </Button>
            <Button
              onClick={() => selectedWithdrawal && approveWithdrawalMutation.mutate(selectedWithdrawal.id)}
              disabled={approveWithdrawalMutation.isPending}
              data-testid="button-approve-withdrawal"
            >
              {approveWithdrawalMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowUpRight className="h-4 w-4 mr-2" />}
              Approve & Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedEscrow} onOpenChange={(open) => !open && setSelectedEscrow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release Escrow to Merchant</DialogTitle>
            <DialogDescription>
              This will release the funds to the merchant immediately, bypassing the 24-hour wait period.
            </DialogDescription>
          </DialogHeader>
          {selectedEscrow && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Order ID</p>
                  <p className="font-mono font-medium">#{selectedEscrow.orderId.substring(0, 8)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Merchant</p>
                  <p className="font-medium">{selectedEscrow.merchant?.username}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Buyer</p>
                  <p className="font-medium">{selectedEscrow.buyer?.username}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Amount</p>
                  <p className="font-mono font-medium">
                    {(selectedEscrow.cryptoAmount || selectedEscrow.btcAmount).toFixed(selectedEscrow.coinSymbol === "BNB" ? 6 : 8)} {selectedEscrow.coinSymbol || "BTC"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">USD Value:</p>
                <p className="font-medium text-lg">${parseFloat(selectedEscrow.usdAmount).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">Admin Notes (optional)</p>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add notes about why you're releasing early..."
                  data-testid="input-escrow-notes"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSelectedEscrow(null)}>Cancel</Button>
            <Button
              onClick={() => selectedEscrow && releaseEscrowMutation.mutate(selectedEscrow.id)}
              disabled={releaseEscrowMutation.isPending}
              data-testid="button-confirm-release-escrow"
            >
              {releaseEscrowMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Release to Merchant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
