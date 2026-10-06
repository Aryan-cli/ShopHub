import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Loader2, Wallet, Bitcoin, ArrowUpRight, ArrowDownLeft, Clock, CheckCircle, XCircle, 
  Search, User, Shield, AlertTriangle, Send, Ban, RefreshCw, Copy, ExternalLink, Coins, Settings
} from "lucide-react";
import { SiBinance } from "react-icons/si";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";

interface EscrowOrder {
  id: string;
  orderId: string;
  buyerId: string;
  merchantId: string;
  coinSymbol: string;
  cryptoAmount: number;
  btcAmount: number;
  usdAmount: string;
  depositAddress: string;
  status: string;
  escrowStartedAt: string | null;
  escrowExpiresAt: string | null;
  transactionHash: string | null;
  buyerRefundAddress: string | null;
  createdAt: string;
  buyer?: { id: string; username: string };
  merchant?: { id: string; username: string; btcWalletAddress?: string };
}

interface PaymentCoin {
  id: string;
  symbol: string;
  name: string;
  network: string;
  isEnabled: boolean;
  explorerUrl: string;
  addressPrefix: string;
  decimals: number;
  sortOrder: number;
}

interface AdminWalletStats {
  totalInEscrow: number;
  totalPendingPayments: number;
  totalReleased: number;
  totalRefunded: number;
  escrowCount: number;
  pendingCount: number;
  bnbTotalInEscrow: number;
  bnbTotalPendingPayments: number;
  bnbTotalReleased: number;
  bnbTotalRefunded: number;
  bnbEscrowCount: number;
  bnbPendingCount: number;
}

interface MasterWalletBalance {
  btcBalance: number;
  bnbBalance: number;
  btcInitialized: boolean;
  bnbInitialized: boolean;
}

function CountdownTimer({ expiresAt, compact = false }: { expiresAt: string; compact?: boolean }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date().getTime();
      const expires = new Date(expiresAt).getTime();
      const diff = expires - now;

      if (diff <= 0) {
        setTimeLeft("Expired");
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(compact ? `${hours}h ${minutes}m` : `${hours}h ${minutes}m ${seconds}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, compact]);

  return (
    <span className="font-mono text-sm font-medium text-orange-600 dark:text-orange-400">
      {timeLeft}
    </span>
  );
}

export default function AdminWallet() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEscrow, setSelectedEscrow] = useState<EscrowOrder | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [usdtWithdrawalAddress, setUsdtWithdrawalAddress] = useState("");

  const { data: escrowOrders, isLoading: escrowLoading, refetch } = useQuery<EscrowOrder[]>({
    queryKey: ["/api/admin/escrow"],
  });

  const { data: stats } = useQuery<AdminWalletStats>({
    queryKey: ["/api/admin/wallet/stats"],
  });

  const { data: btcRate } = useQuery<{ rate: number }>({
    queryKey: ["/api/btc-rate"],
  });

  const { data: paymentCoins, refetch: refetchCoins } = useQuery<PaymentCoin[]>({
    queryKey: ["/api/admin/payment-coins"],
  });

  const { data: masterBalance } = useQuery<MasterWalletBalance>({
    queryKey: ["/api/admin/wallet/master-balance"],
  });

  const { data: bnbRate } = useQuery<{ rate: number }>({
    queryKey: ["/api/bnb-rate"],
  });

  const { data: adminWallet } = useQuery({
    queryKey: ["/api/admin/wallet"],
  });

  const toggleCoinMutation = useMutation({
    mutationFn: async (coinId: string) => {
      return apiRequest("POST", `/api/admin/payment-coins/${coinId}/toggle`);
    },
    onSuccess: () => {
      toast({ title: "Payment coin updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-coins"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-coins"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to toggle payment coin", variant: "destructive" });
    },
  });

  const toggleAutoTransferMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest("POST", "/api/admin/wallet/toggle-auto-transfer", { enabled });
    },
    onSuccess: (data: any) => {
      toast({ title: "Auto-transfer setting updated", description: data.message || "" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wallet"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: "Failed to update auto-transfer setting", variant: "destructive" });
    },
  });

  const updateUsdtAddressMutation = useMutation({
    mutationFn: async (address: string) => {
      return apiRequest("POST", "/api/admin/wallet/addresses", { usdtAddress: address });
    },
    onSuccess: () => {
      toast({ title: "USDT withdrawal address saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wallet"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: "Failed to save USDT withdrawal address", variant: "destructive" });
    },
  });

  const cancelEscrowMutation = useMutation({
    mutationFn: async (escrowId: string) => {
      return apiRequest("POST", `/api/admin/escrow/${escrowId}/cancel`, { adminNotes });
    },
    onSuccess: () => {
      toast({ title: "Payment cancelled", description: "Funds returned to buyer wallet" });
      setShowCancelDialog(false);
      setSelectedEscrow(null);
      setAdminNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/escrow"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wallet/stats"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to cancel payment", variant: "destructive" });
    },
  });

  const releaseEscrowMutation = useMutation({
    mutationFn: async (escrowId: string) => {
      return apiRequest("POST", `/api/admin/escrow/${escrowId}/release`, { adminNotes });
    },
    onSuccess: () => {
      toast({ title: "Payment released", description: "Funds released to merchant" });
      setSelectedEscrow(null);
      setAdminNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/escrow"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wallet/stats"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to release payment", variant: "destructive" });
    },
  });

  const rate = btcRate?.rate || 45000;

  const filteredOrders = escrowOrders?.filter(order => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      order.buyer?.username?.toLowerCase().includes(query) ||
      order.merchant?.username?.toLowerCase().includes(query) ||
      order.buyerId.toLowerCase().includes(query) ||
      order.merchantId.toLowerCase().includes(query) ||
      order.orderId.toLowerCase().includes(query) ||
      order.depositAddress.toLowerCase().includes(query)
    );
  }) || [];

  const pendingPayments = filteredOrders.filter(o => o.status === "pending_payment");
  const inEscrow = filteredOrders.filter(o => o.status === "escrow");
  const disputed = filteredOrders.filter(o => o.status === "disputed");
  const released = filteredOrders.filter(o => o.status === "released");
  const refunded = filteredOrders.filter(o => o.status === "refunded");

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast({ title: "Copied!", description: "Address copied to clipboard" });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      pending_payment: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
      escrow: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
      released: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
      disputed: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
      refunded: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
      cancelled: "bg-gray-50 text-gray-700 dark:bg-gray-950 dark:text-gray-300",
    };
    return <Badge variant="outline" className={variants[status] || ""}>{status.replace(/_/g, " ")}</Badge>;
  };

  const totalInEscrow = inEscrow.filter(o => o.coinSymbol !== "BNB").reduce((sum, o) => sum + o.btcAmount, 0);
  const totalPending = pendingPayments.filter(o => o.coinSymbol !== "BNB").reduce((sum, o) => sum + o.btcAmount, 0);
  const bnbInEscrow = inEscrow.filter(o => o.coinSymbol === "BNB").reduce((sum, o) => sum + (o.cryptoAmount || 0), 0);
  const bnbPending = pendingPayments.filter(o => o.coinSymbol === "BNB").reduce((sum, o) => sum + (o.cryptoAmount || 0), 0);
  const bnbRateValue = bnbRate?.rate || 650;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Wallet className="h-8 w-8 text-primary" />
            Admin Crypto Wallet
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage all crypto payments, escrows, and transactions
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" data-testid="button-refresh">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card className="border-2 border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            Master Wallet Balance
          </CardTitle>
          <CardDescription>Real-time balance from HD wallet on blockchain</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div className="flex items-center gap-3">
              <Bitcoin className="h-8 w-8 text-orange-500" />
              <div>
                <p className="text-2xl font-mono font-bold" data-testid="text-master-btc">
                  {masterBalance?.btcBalance?.toFixed(8) || '0.00000000'} BTC
                </p>
                <p className="text-sm text-muted-foreground">
                  ${((masterBalance?.btcBalance || 0) * rate).toFixed(2)} USD
                </p>
                {!masterBalance?.btcInitialized && (
                  <Badge variant="outline" className="mt-1 text-yellow-600">Wallet not initialized</Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <SiBinance className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-mono font-bold" data-testid="text-master-bnb">
                  {masterBalance?.bnbBalance?.toFixed(6) || '0.000000'} BNB
                </p>
                <p className="text-sm text-muted-foreground">
                  ${((masterBalance?.bnbBalance || 0) * bnbRateValue).toFixed(2)} USD
                </p>
                {!masterBalance?.bnbInitialized && (
                  <Badge variant="outline" className="mt-1 text-yellow-600">Wallet not initialized</Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Bitcoin className="h-3 w-3 text-orange-500" /> BTC in Escrow
            </CardDescription>
            <CardTitle className="text-lg font-mono flex items-center gap-2" data-testid="text-btc-escrow">
              <Shield className="h-4 w-4 text-blue-500" />
              {totalInEscrow.toFixed(6)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{inEscrow.filter(o => o.coinSymbol !== "BNB").length} orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <SiBinance className="h-3 w-3 text-yellow-500" /> BNB in Escrow
            </CardDescription>
            <CardTitle className="text-lg font-mono flex items-center gap-2" data-testid="text-bnb-escrow">
              <Shield className="h-4 w-4 text-blue-500" />
              {bnbInEscrow.toFixed(6)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{inEscrow.filter(o => o.coinSymbol === "BNB").length} orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Bitcoin className="h-3 w-3 text-orange-500" /> BTC Pending
            </CardDescription>
            <CardTitle className="text-lg font-mono flex items-center gap-2" data-testid="text-btc-pending">
              <Clock className="h-4 w-4 text-yellow-500" />
              {totalPending.toFixed(6)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{pendingPayments.filter(o => o.coinSymbol !== "BNB").length} awaiting</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <SiBinance className="h-3 w-3 text-yellow-500" /> BNB Pending
            </CardDescription>
            <CardTitle className="text-lg font-mono flex items-center gap-2" data-testid="text-bnb-pending">
              <Clock className="h-4 w-4 text-yellow-500" />
              {bnbPending.toFixed(6)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{pendingPayments.filter(o => o.coinSymbol === "BNB").length} awaiting</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Disputed</CardDescription>
            <CardTitle className="text-lg flex items-center gap-2 text-red-600" data-testid="text-disputed">
              <AlertTriangle className="h-4 w-4" />
              {disputed.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Needs attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Released</CardDescription>
            <CardTitle className="text-lg flex items-center gap-2 text-green-600" data-testid="text-released">
              <CheckCircle className="h-4 w-4" />
              {released.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by user ID, username, order ID, or wallet address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
        {searchQuery && (
          <Button variant="ghost" onClick={() => setSearchQuery("")}>
            Clear
          </Button>
        )}
      </div>

      <Tabs defaultValue="escrow" className="space-y-4">
        <TabsList>
          <TabsTrigger value="escrow" data-testid="tab-escrow">
            In Escrow 
            {inEscrow.length > 0 && <Badge variant="secondary" className="ml-2">{inEscrow.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending 
            {pendingPayments.length > 0 && <Badge variant="outline" className="ml-2">{pendingPayments.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="disputed" data-testid="tab-disputed">
            Disputed 
            {disputed.length > 0 && <Badge variant="destructive" className="ml-2">{disputed.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">All Orders</TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings">
            <Settings className="h-4 w-4 mr-1" />
            Payment Coins
          </TabsTrigger>
        </TabsList>

        <TabsContent value="escrow">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-500" />
                Payments in Escrow (24h Hold)
              </CardTitle>
              <CardDescription>
                These payments are held for 24 hours. You can manually cancel and return to buyer, or release early to merchant.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {escrowLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : inEscrow.length > 0 ? (
                <div className="space-y-4">
                  {inEscrow.map((order) => (
                    <div key={order.id} className="p-4 border rounded-lg space-y-3" data-testid={`card-escrow-${order.id}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Order #{order.orderId.substring(0, 8)}</span>
                            {getStatusBadge(order.status)}
                          </div>
                          {order.escrowExpiresAt && (
                            <div className="flex items-center gap-1 text-sm">
                              <Clock className="h-3 w-3" />
                              <span className="text-muted-foreground">Auto-releases in:</span>
                              <CountdownTimer expiresAt={order.escrowExpiresAt} />
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-2 justify-end">
                            {order.coinSymbol === "BNB" || order.coinSymbol === "USDT" ? (
                              <SiBinance className="h-5 w-5 text-yellow-500" />
                            ) : (
                              <Bitcoin className="h-5 w-5 text-orange-500" />
                            )}
                            <p className="font-mono font-bold text-lg">
                              {(order.coinSymbol === "BTC" ? order.btcAmount : order.cryptoAmount || 0).toFixed(order.coinSymbol === "BTC" ? 8 : 6)} {order.coinSymbol || "BTC"}
                            </p>
                          </div>
                          <p className="text-sm text-muted-foreground">${parseFloat(order.usdAmount).toFixed(2)} USD</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="space-y-1">
                          <p className="text-muted-foreground flex items-center gap-1">
                            <User className="h-3 w-3" /> Buyer
                          </p>
                          <p className="font-medium">{order.buyer?.username || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground font-mono">{order.buyerId.substring(0, 12)}...</p>
                          {order.buyerRefundAddress && (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">Refund:</span>
                              <code className="text-xs font-mono">{order.buyerRefundAddress.substring(0, 15)}...</code>
                              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => copyAddress(order.buyerRefundAddress!)}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-muted-foreground flex items-center gap-1">
                            <ArrowUpRight className="h-3 w-3" /> Merchant (Receiver)
                          </p>
                          <p className="font-medium">{order.merchant?.username || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground font-mono">{order.merchantId.substring(0, 12)}...</p>
                        </div>
                      </div>

                      <div className="text-sm">
                        <p className="text-muted-foreground mb-1">Deposit Address (Server Wallet)</p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 p-2 bg-muted rounded text-xs font-mono break-all">
                            {order.depositAddress}
                          </code>
                          <Button size="icon" variant="outline" onClick={() => copyAddress(order.depositAddress)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2 border-t">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => { setSelectedEscrow(order); setShowCancelDialog(true); }}
                          data-testid={`button-cancel-${order.id}`}
                        >
                          <Ban className="h-4 w-4 mr-1" />
                          Cancel & Return
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => { setSelectedEscrow(order); releaseEscrowMutation.mutate(order.id); }}
                          disabled={releaseEscrowMutation.isPending}
                          data-testid={`button-release-${order.id}`}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Release Now
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">No payments in escrow</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Pending Payments</CardTitle>
              <CardDescription>Orders waiting for buyer to send BTC</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingPayments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Buyer</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Deposit Address</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingPayments.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono">#{order.orderId.substring(0, 8)}</TableCell>
                        <TableCell>
                          <div>
                            <p>{order.buyer?.username}</p>
                            <p className="text-xs text-muted-foreground">{order.buyerId.substring(0, 10)}...</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p>{order.merchant?.username}</p>
                            <p className="text-xs text-muted-foreground">{order.merchantId.substring(0, 10)}...</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">{order.btcAmount.toFixed(8)} BTC</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <code className="text-xs">{order.depositAddress.substring(0, 15)}...</code>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyAddress(order.depositAddress)}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{new Date(order.createdAt).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">No pending payments</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="disputed">
          <Card>
            <CardHeader>
              <CardTitle className="text-red-600 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Disputed Payments
              </CardTitle>
              <CardDescription>Go to Escrow Management to resolve disputes</CardDescription>
            </CardHeader>
            <CardContent>
              {disputed.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Buyer</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {disputed.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono">#{order.orderId.substring(0, 8)}</TableCell>
                        <TableCell>{order.buyer?.username}</TableCell>
                        <TableCell>{order.merchant?.username}</TableCell>
                        <TableCell className="font-mono">{order.btcAmount.toFixed(8)} BTC</TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">No disputed payments</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed">
          <Card>
            <CardHeader>
              <CardTitle>All Orders</CardTitle>
              <CardDescription>Complete order history with detailed information</CardDescription>
            </CardHeader>
            <CardContent>
              {filteredOrders.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Buyer</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>USD</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono">#{order.orderId.substring(0, 8)}</TableCell>
                        <TableCell>
                          <div>
                            <p>{order.buyer?.username}</p>
                            <p className="text-xs text-muted-foreground">{order.buyerId.substring(0, 10)}...</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p>{order.merchant?.username}</p>
                            <p className="text-xs text-muted-foreground">{order.merchantId.substring(0, 10)}...</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">
                          {(order.cryptoAmount || order.btcAmount).toFixed(order.coinSymbol === "BNB" ? 6 : 8)} {order.coinSymbol || "BTC"}
                        </TableCell>
                        <TableCell>${parseFloat(order.usdAmount).toFixed(2)}</TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell className="text-muted-foreground">{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">No orders found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5" />
                Payment Coins Configuration
              </CardTitle>
              <CardDescription>
                Enable or disable cryptocurrency payment options for your marketplace
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Auto-Transfer Fees Setting */}
                <div className="flex items-center justify-between p-4 rounded-lg border bg-purple-50 dark:bg-purple-950 border-purple-300 dark:border-purple-700">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900">
                      <Coins className="h-6 w-6 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium">Auto-Transfer Collected Fees</p>
                      <p className="text-sm text-muted-foreground">
                        Automatically send collected USDT fees (0.01 USDT) to your personal wallet
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant={adminWallet?.autoTransferFees ? "default" : "secondary"}>
                      {adminWallet?.autoTransferFees ? "Enabled" : "Disabled"}
                    </Badge>
                    <Switch
                      checked={adminWallet?.autoTransferFees || false}
                      onCheckedChange={(checked) => toggleAutoTransferMutation.mutate(checked)}
                      disabled={toggleAutoTransferMutation.isPending}
                      data-testid="switch-auto-transfer-fees"
                    />
                  </div>
                </div>

                {adminWallet?.autoTransferFees && (
                  <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950 border border-green-300 dark:border-green-700">
                    <p className="text-sm text-green-900 dark:text-green-100">
                      ✓ Auto-transfer is <strong>ENABLED</strong>. All collected USDT fees will be sent to:<br/>
                      <code className="block mt-2 text-xs break-all font-mono bg-green-100 dark:bg-green-900 p-2 rounded">
                        {adminWallet?.usdtWithdrawalAddress || "No withdrawal address set"}
                      </code>
                    </p>
                  </div>
                )}

                {adminWallet?.autoTransferFees && (
                  <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-300 dark:border-blue-700 space-y-3">
                    <div>
                      <label className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        USDT Withdrawal Address
                      </label>
                      <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                        Enter the wallet address where collected USDT fees will be automatically sent
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="0x..."
                        value={usdtWithdrawalAddress || adminWallet?.usdtWithdrawalAddress || ""}
                        onChange={(e) => setUsdtWithdrawalAddress(e.target.value)}
                        className="flex-1 px-3 py-2 rounded border border-blue-200 dark:border-blue-700 bg-white dark:bg-blue-900 text-blue-900 dark:text-blue-100 text-sm"
                        disabled={updateUsdtAddressMutation.isPending}
                      />
                      <button
                        onClick={() => {
                          if (usdtWithdrawalAddress || adminWallet?.usdtWithdrawalAddress) {
                            updateUsdtAddressMutation.mutate(usdtWithdrawalAddress || adminWallet?.usdtWithdrawalAddress || "");
                          } else {
                            toast({ title: "Error", description: "Please enter a valid address", variant: "destructive" });
                          }
                        }}
                        disabled={updateUsdtAddressMutation.isPending || !usdtWithdrawalAddress}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-sm font-medium disabled:opacity-50"
                      >
                        {updateUsdtAddressMutation.isPending ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Payment Coins */}
                {paymentCoins?.map((coin) => (
                  <div key={coin.id} className="flex items-center justify-between p-4 rounded-lg border">
                    <div className="flex items-center gap-4">
                      {coin.symbol === "BTC" ? (
                        <div className="p-3 rounded-full bg-orange-100 dark:bg-orange-900">
                          <Bitcoin className="h-6 w-6 text-orange-500" />
                        </div>
                      ) : coin.symbol === "BNB" ? (
                        <div className="p-3 rounded-full bg-yellow-100 dark:bg-yellow-900">
                          <SiBinance className="h-6 w-6 text-yellow-500" />
                        </div>
                      ) : (
                        <div className="p-3 rounded-full bg-gray-100 dark:bg-gray-800">
                          <Coins className="h-6 w-6" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{coin.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {coin.symbol} - {coin.network}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant={coin.isEnabled ? "default" : "secondary"}>
                        {coin.isEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                      <Switch
                        checked={coin.isEnabled}
                        onCheckedChange={() => toggleCoinMutation.mutate(coin.id)}
                        disabled={toggleCoinMutation.isPending}
                        data-testid={`switch-coin-${coin.symbol.toLowerCase()}`}
                      />
                    </div>
                  </div>
                ))}
                
                {!paymentCoins?.length && (
                  <p className="text-center text-muted-foreground py-8">No payment coins configured</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Ban className="h-5 w-5" />
              Cancel & Return Payment
            </DialogTitle>
            <DialogDescription>
              This will cancel the escrow and return the funds to the buyer's wallet.
            </DialogDescription>
          </DialogHeader>
          {selectedEscrow && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
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
              {selectedEscrow.buyerRefundAddress && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Refund Address</p>
                  <code className="block p-2 bg-muted rounded text-xs break-all">{selectedEscrow.buyerRefundAddress}</code>
                </div>
              )}
              <div>
                <Label className="text-sm text-muted-foreground">Reason for cancellation</Label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Enter reason..."
                  className="mt-1"
                  data-testid="input-cancel-reason"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => selectedEscrow && cancelEscrowMutation.mutate(selectedEscrow.id)}
              disabled={cancelEscrowMutation.isPending}
              data-testid="button-confirm-cancel"
            >
              {cancelEscrowMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Ban className="h-4 w-4 mr-2" />}
              Confirm Cancel & Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
