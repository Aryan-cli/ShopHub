import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Navbar } from "@/components/navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Wallet, Bitcoin, ArrowUpRight, Clock, CheckCircle, XCircle, Shield, ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
import { SiBinance } from "react-icons/si";
import { useState, useEffect } from "react";

function CountdownTimer({ expiresAt, compact = false }: { expiresAt: string; compact?: boolean }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date().getTime();
      const expires = new Date(expiresAt).getTime();
      const diff = expires - now;

      if (diff <= 0) {
        setTimeLeft("Ready");
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
    <div className="flex items-center gap-1 text-orange-500 dark:text-orange-400">
      <Clock className="h-3 w-3" />
      <span className="font-mono text-sm font-medium">{timeLeft}</span>
    </div>
  );
}

interface VirtualWallet {
  id: string;
  userId: string;
  availableBalance: number;
  pendingBalance: number;
  totalEarned: number;
  bnbAvailableBalance: number;
  bnbPendingBalance: number;
  bnbTotalEarned: number;
  usdtAvailableBalance?: number;
  usdtPendingBalance?: number;
  usdtTotalEarned?: number;
  createdAt: string;
  updatedAt: string;
}

interface LedgerEntry {
  id: string;
  userId: string;
  escrowOrderId: string | null;
  withdrawalId: string | null;
  type: string;
  btcAmount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

interface WithdrawalRequest {
  id: string;
  merchantId: string;
  coinSymbol: string;
  btcAmount: number;
  bnbAmount: number;
  usdtAmount?: number;
  btcAddress: string | null;
  bnbAddress: string | null;
  usdtAddress?: string | null;
  status: string;
  adminNotes: string | null;
  transactionHash: string | null;
  createdAt: string;
}

interface EscrowOrder {
  id: string;
  orderId: string;
  coinSymbol: string;
  cryptoAmount: number;
  btcAmount: number;
  usdAmount: string;
  status: string;
  createdAt: string;
  escrowStartedAt: string | null;
  escrowExpiresAt: string | null;
  depositAddress: string;
  buyer?: { id: string; username: string };
}

interface PaymentCoin {
  id: string;
  symbol: string;
  name: string;
  isEnabled: boolean;
}

const coinConfig: Record<string, { gradient: string; iconColor: string; bg: string; border: string }> = {
  BTC: {
    gradient: "from-orange-500/10 to-orange-600/5",
    iconColor: "text-orange-500",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
  },
  BNB: {
    gradient: "from-yellow-500/10 to-yellow-600/5",
    iconColor: "text-yellow-500",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
  },
  USDT: {
    gradient: "from-emerald-500/10 to-emerald-600/5",
    iconColor: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
};

function CoinCard({
  coin,
  availableBalance,
  rate,
  decimals,
  icon: Icon,
  onWithdraw,
}: {
  coin: string;
  availableBalance: number;
  rate: number;
  decimals: number;
  icon: any;
  onWithdraw: () => void;
}) {
  const cfg = coinConfig[coin] || coinConfig.BTC;
  const hasBalance = availableBalance > 0;

  return (
    <div className={`relative flex flex-col p-5 rounded-xl border ${cfg.border} bg-gradient-to-br ${cfg.gradient} overflow-hidden transition-all duration-200 hover:shadow-md`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-lg ${cfg.bg}`}>
          <Icon className={`h-5 w-5 ${cfg.iconColor}`} />
        </div>
        <span className="font-bold text-base tracking-wide">{coin}</span>
      </div>

      <div className="mb-1">
        <p className="font-mono font-bold text-xl leading-tight">
          {availableBalance.toFixed(decimals)}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          ≈ ${(availableBalance * rate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
        </p>
      </div>

      <div className="mt-4">
        <Button
          size="sm"
          variant={hasBalance ? "default" : "secondary"}
          className={`w-full text-xs font-semibold gap-1.5 ${hasBalance ? "" : "opacity-60"}`}
          disabled={!hasBalance}
          onClick={onWithdraw}
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
          Withdraw
        </Button>
      </div>
    </div>
  );
}

export default function MerchantWallet() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [showWithdrawDialog, setShowWithdrawDialog] = useState<string | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [expandEscrow, setExpandEscrow] = useState(true);

  const { data: wallet, isLoading: walletLoading } = useQuery<VirtualWallet>({
    queryKey: ["/api/wallet"],
    enabled: !!user,
  });

  const { data: ledger, isLoading: ledgerLoading } = useQuery<LedgerEntry[]>({
    queryKey: ["/api/wallet/ledger"],
    enabled: !!user,
  });

  const { data: withdrawals } = useQuery<WithdrawalRequest[]>({
    queryKey: ["/api/withdrawals"],
    enabled: !!user,
  });

  const { data: escrowOrders } = useQuery<EscrowOrder[]>({
    queryKey: ["/api/escrow/merchant"],
    enabled: !!user,
  });

  const { data: btcRate } = useQuery<{ rate: number }>({
    queryKey: ["/api/btc-rate"],
  });

  const { data: bnbRateData } = useQuery<{ btc: number; bnb: number }>({
    queryKey: ["/api/bnb-rate"],
  });

  const { data: usdtRate } = useQuery<{ rate: number }>({
    queryKey: ["/api/usdt-rate"],
  });

  const { data: paymentCoins } = useQuery<PaymentCoin[]>({
    queryKey: ["/api/payment-coins"],
  });

  const withdrawMutation = useMutation({
    mutationFn: async (coinSymbol: string) => {
      return apiRequest("POST", "/api/withdrawals", {
        coinSymbol,
        amount: parseFloat(withdrawAmount),
        address: withdrawAddress,
      });
    },
    onSuccess: () => {
      const coinName = showWithdrawDialog === "BTC" ? "BTC" : showWithdrawDialog === "BNB" ? "BNB" : "USDT";
      toast({ title: "Withdrawal requested", description: `Your ${coinName} withdrawal is pending admin approval.` });
      setShowWithdrawDialog(null);
      setWithdrawAmount("");
      setWithdrawAddress("");
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/withdrawals"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create withdrawal request", variant: "destructive" });
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !user.isMerchant) {
    setLocation("/login");
    return null;
  }

  const btcRateValue = btcRate?.rate || 45000;
  const bnbRateValue = bnbRateData?.bnb || 650;
  const usdtRateValue = usdtRate?.rate || 1;

  const enabledSymbols = new Set(
    (paymentCoins || []).filter(c => c.isEnabled).map(c => c.symbol.toUpperCase())
  );
  const btcEnabled = !paymentCoins || enabledSymbols.has("BTC");
  const bnbEnabled = enabledSymbols.has("BNB");
  const usdtEnabled = enabledSymbols.has("USDT");

  const enabledCoinsCount = [btcEnabled, bnbEnabled, usdtEnabled].filter(Boolean).length;
  const gridCols = enabledCoinsCount === 1 ? "grid-cols-1 max-w-xs" : enabledCoinsCount === 2 ? "grid-cols-2 max-w-sm" : "grid-cols-3";

  const inEscrow = escrowOrders?.filter(o => o.status === "escrow" || o.status === "pending_payment") || [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-5xl">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Wallet className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Merchant Wallet</h1>
              <p className="text-sm text-muted-foreground">Manage your crypto earnings and withdrawals</p>
            </div>
          </div>
        </div>

        {walletLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">

            {/* Available Balance */}
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4.5 w-4.5 text-primary h-5 w-5" />
                  Available Balance
                </CardTitle>
                <CardDescription className="text-xs">
                  Showing only payment methods enabled by admin
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`grid ${gridCols} gap-4`}>
                  {btcEnabled && (
                    <CoinCard
                      coin="BTC"
                      availableBalance={wallet?.availableBalance || 0}
                      rate={btcRateValue}
                      decimals={8}
                      icon={Bitcoin}
                      onWithdraw={() => setShowWithdrawDialog("BTC")}
                    />
                  )}
                  {bnbEnabled && (
                    <CoinCard
                      coin="BNB"
                      availableBalance={wallet?.bnbAvailableBalance || 0}
                      rate={bnbRateValue}
                      decimals={6}
                      icon={SiBinance}
                      onWithdraw={() => setShowWithdrawDialog("BNB")}
                    />
                  )}
                  {usdtEnabled && (
                    <CoinCard
                      coin="USDT"
                      availableBalance={wallet?.usdtAvailableBalance || 0}
                      rate={usdtRateValue}
                      decimals={6}
                      icon={() => <span className="text-emerald-500 font-bold text-base">₮</span>}
                      onWithdraw={() => setShowWithdrawDialog("USDT")}
                    />
                  )}
                  {enabledCoinsCount === 0 && (
                    <p className="col-span-3 text-center text-muted-foreground py-6 text-sm">
                      No payment methods are currently enabled by admin.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Withdraw Dialogs */}
            <Dialog open={showWithdrawDialog === "BTC"} onOpenChange={(open) => !open && setShowWithdrawDialog(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Bitcoin className="h-5 w-5 text-orange-500" /> Withdraw BTC
                  </DialogTitle>
                  <DialogDescription>
                    Enter the amount and your BTC wallet address. Withdrawals require admin approval.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="btc-amount">Amount (BTC)</Label>
                    <Input id="btc-amount" type="number" step="0.00000001" max={wallet?.availableBalance || 0} value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="0.00000000" />
                    <p className="text-xs text-muted-foreground">Available: {(wallet?.availableBalance || 0).toFixed(8)} BTC</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="btc-address">BTC Address</Label>
                    <Input id="btc-address" value={withdrawAddress} onChange={(e) => setWithdrawAddress(e.target.value)} placeholder="bc1q..." />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowWithdrawDialog(null)}>Cancel</Button>
                  <Button onClick={() => withdrawMutation.mutate("BTC")} disabled={!withdrawAmount || !withdrawAddress || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > (wallet?.availableBalance || 0) || withdrawMutation.isPending}>
                    {withdrawMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Request Withdrawal
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={showWithdrawDialog === "BNB"} onOpenChange={(open) => !open && setShowWithdrawDialog(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <SiBinance className="h-5 w-5 text-yellow-500" /> Withdraw BNB
                  </DialogTitle>
                  <DialogDescription>
                    Enter the amount and your BNB wallet address (BSC network). Withdrawals require admin approval.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="bnb-amount">Amount (BNB)</Label>
                    <Input id="bnb-amount" type="number" step="0.000001" max={wallet?.bnbAvailableBalance || 0} value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="0.000000" />
                    <p className="text-xs text-muted-foreground">Available: {(wallet?.bnbAvailableBalance || 0).toFixed(6)} BNB</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bnb-address">BNB Address (BSC)</Label>
                    <Input id="bnb-address" value={withdrawAddress} onChange={(e) => setWithdrawAddress(e.target.value)} placeholder="0x..." />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowWithdrawDialog(null)}>Cancel</Button>
                  <Button onClick={() => withdrawMutation.mutate("BNB")} disabled={!withdrawAmount || !withdrawAddress || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > (wallet?.bnbAvailableBalance || 0) || withdrawMutation.isPending}>
                    {withdrawMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Request Withdrawal
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={showWithdrawDialog === "USDT"} onOpenChange={(open) => !open && setShowWithdrawDialog(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold text-lg">₮</span> Withdraw USDT
                  </DialogTitle>
                  <DialogDescription>
                    Enter the amount and your USDT wallet address (BSC network). Withdrawals require admin approval.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="usdt-amount">Amount (USDT)</Label>
                    <Input id="usdt-amount" type="number" step="0.01" max={wallet?.usdtAvailableBalance || 0} value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="0.00" />
                    <p className="text-xs text-muted-foreground">Available: {(wallet?.usdtAvailableBalance || 0).toFixed(6)} USDT</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="usdt-address">USDT Address (BSC)</Label>
                    <Input id="usdt-address" value={withdrawAddress} onChange={(e) => setWithdrawAddress(e.target.value)} placeholder="0x..." />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowWithdrawDialog(null)}>Cancel</Button>
                  <Button onClick={() => withdrawMutation.mutate("USDT")} disabled={!withdrawAmount || !withdrawAddress || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > (wallet?.usdtAvailableBalance || 0) || withdrawMutation.isPending}>
                    {withdrawMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Request Withdrawal
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Pending in Escrow */}
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setExpandEscrow(!expandEscrow)}>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-blue-500/10">
                      <Clock className="h-4 w-4 text-blue-500" />
                    </div>
                    Pending in Escrow
                    {inEscrow.length > 0 && (
                      <Badge variant="secondary" className="ml-1 text-xs">{inEscrow.length}</Badge>
                    )}
                  </CardTitle>
                  <div className="text-muted-foreground">
                    {expandEscrow ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>
              </CardHeader>
              {expandEscrow && (
                <CardContent className="pt-2">
                  {inEscrow.length > 0 ? (
                    <div className="space-y-2">
                      {inEscrow.map((order) => (
                        <div key={order.id} className="p-3 rounded-lg border border-border/50 bg-muted/30 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-1.5 rounded-md ${
                              order.coinSymbol === "BTC" ? "bg-orange-500/10" :
                              order.coinSymbol === "BNB" ? "bg-yellow-500/10" : "bg-emerald-500/10"
                            }`}>
                              {order.coinSymbol === "BTC" ? (
                                <Bitcoin className="h-4 w-4 text-orange-500" />
                              ) : order.coinSymbol === "BNB" ? (
                                <SiBinance className="h-4 w-4 text-yellow-500" />
                              ) : (
                                <span className="text-emerald-500 font-bold text-sm px-0.5">₮</span>
                              )}
                            </div>
                            <div>
                              <p className="font-mono text-sm font-semibold">
                                {(order.cryptoAmount || order.btcAmount).toFixed(order.coinSymbol === "BTC" ? 8 : 6)} {order.coinSymbol}
                              </p>
                              <p className="text-xs text-muted-foreground">Order #{order.orderId.substring(0, 8)}</p>
                            </div>
                          </div>
                          <CountdownTimer expiresAt={order.escrowExpiresAt || order.createdAt} compact={true} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8 text-sm">No escrow payments pending</p>
                  )}
                </CardContent>
              )}
            </Card>

            {/* Withdrawal Requests + Total Earned */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-border/60 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <Shield className="h-4 w-4 text-primary" />
                    </div>
                    Withdrawal Requests
                  </CardTitle>
                  <CardDescription className="text-xs">Your withdrawal history</CardDescription>
                </CardHeader>
                <CardContent>
                  {withdrawals && withdrawals.length > 0 ? (
                    <div className="space-y-2">
                      {withdrawals.slice(0, 10).map((w) => (
                        <div key={w.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/40">
                          <div className="flex items-center gap-2.5">
                            <div className={`p-1.5 rounded-md ${
                              w.coinSymbol === "BTC" ? "bg-orange-500/10" :
                              w.coinSymbol === "BNB" ? "bg-yellow-500/10" : "bg-emerald-500/10"
                            }`}>
                              {w.coinSymbol === "BTC" ? (
                                <Bitcoin className="h-3.5 w-3.5 text-orange-500" />
                              ) : w.coinSymbol === "BNB" ? (
                                <SiBinance className="h-3.5 w-3.5 text-yellow-500" />
                              ) : (
                                <span className="text-emerald-500 font-bold text-xs">₮</span>
                              )}
                            </div>
                            <div>
                              <p className="font-mono text-sm font-medium">
                                {w.coinSymbol === "BTC"
                                  ? `${w.btcAmount.toFixed(8)} BTC`
                                  : w.coinSymbol === "BNB"
                                  ? `${(w.bnbAmount || 0).toFixed(6)} BNB`
                                  : `${(w.usdtAmount || 0).toFixed(6)} USDT`}
                              </p>
                              <p className="text-xs text-muted-foreground truncate max-w-[140px]">
                                {w.coinSymbol === "BTC" ? w.btcAddress : w.coinSymbol === "BNB" ? w.bnbAddress : w.usdtAddress}
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline" className={
                            w.status === "completed" ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400" :
                            w.status === "pending" ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" :
                            w.status === "rejected" ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400" : ""
                          }>
                            {w.status === "completed" && <CheckCircle className="h-3 w-3 mr-1" />}
                            {w.status === "rejected" && <XCircle className="h-3 w-3 mr-1" />}
                            {w.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                            {w.status.charAt(0).toUpperCase() + w.status.slice(1)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8 text-sm">No withdrawals yet</p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/60 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Total Earned (All Time)</CardTitle>
                  <CardDescription className="text-xs">Across all enabled coins</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {btcEnabled && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-orange-500/5 border border-orange-500/15">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-md bg-orange-500/10">
                          <Bitcoin className="h-4 w-4 text-orange-500" />
                        </div>
                        <span className="text-sm font-medium">BTC</span>
                      </div>
                      <span className="font-mono text-sm font-semibold">{(wallet?.totalEarned || 0).toFixed(8)}</span>
                    </div>
                  )}
                  {bnbEnabled && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/15">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-md bg-yellow-500/10">
                          <SiBinance className="h-4 w-4 text-yellow-500" />
                        </div>
                        <span className="text-sm font-medium">BNB</span>
                      </div>
                      <span className="font-mono text-sm font-semibold">{(wallet?.bnbTotalEarned || 0).toFixed(6)}</span>
                    </div>
                  )}
                  {usdtEnabled && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-md bg-emerald-500/10">
                          <span className="text-emerald-500 font-bold text-sm px-0.5">₮</span>
                        </div>
                        <span className="text-sm font-medium">USDT</span>
                      </div>
                      <span className="font-mono text-sm font-semibold">{(wallet?.usdtTotalEarned || 0).toFixed(6)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Transaction History */}
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Transaction History</CardTitle>
                <CardDescription className="text-xs">All balance changes</CardDescription>
              </CardHeader>
              <CardContent>
                {ledgerLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : ledger && ledger.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/50">
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs">Amount</TableHead>
                        <TableHead className="text-xs">Balance After</TableHead>
                        <TableHead className="text-xs">Description</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledger.slice(0, 20).map((entry) => (
                        <TableRow key={entry.id} className="border-border/40">
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${
                              entry.type === "credit" ? "border-green-500/30 text-green-600 dark:text-green-400" :
                              "border-red-500/30 text-red-600 dark:text-red-400"
                            }`}>
                              {entry.type}
                            </Badge>
                          </TableCell>
                          <TableCell className={`font-mono text-xs font-medium ${
                            entry.type === "credit" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                          }`}>
                            {entry.type === "credit" ? "+" : "-"}{Math.abs(entry.btcAmount).toFixed(8)} BTC
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {entry.balanceAfter.toFixed(8)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                            {entry.description}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(entry.createdAt).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center text-muted-foreground py-8 text-sm">No transactions yet</p>
                )}
              </CardContent>
            </Card>

          </div>
        )}
      </main>
    </div>
  );
}
