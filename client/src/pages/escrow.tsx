import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Navbar } from "@/components/navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Clock, CheckCircle, AlertTriangle, XCircle, Bitcoin, Shield, Copy, Search, Wallet, ExternalLink, Package } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SiBinance } from "react-icons/si";
import { useState, useEffect } from "react";
import QRCode from "react-qr-code";

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
  confirmedAt: string | null;
  releasedAt: string | null;
  refundedAt: string | null;
  buyerRefundAddress: string | null;
  transactionHash: string | null;
  createdAt: string;
  earlyApprovalEnabled: boolean;
  merchant?: { id: string; username: string };
  buyer?: { id: string; username: string };
  dispute?: any;
}

interface PurchaseSnapshot {
  id: string;
  escrowOrderId: string;
  productName: string;
  productDescription: string;
  productImages: string[];
  afterBuyMessage: string | null;
  afterBuyButtonLabel: string | null;
  afterBuyButtonUrl: string | null;
}

function RefundedDisplay({ escrow }: { escrow: EscrowOrder }) {
  const [refundAge, setRefundAge] = useState("");

  useEffect(() => {
    if (!escrow.refundedAt) return;
    
    const updateAge = () => {
      const now = new Date().getTime();
      const refunded = new Date(escrow.refundedAt!).getTime();
      const ageMs = now - refunded;
      const hours = Math.floor(ageMs / (1000 * 60 * 60));
      const minutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
      const isWithin24h = hours < 24;
      
      if (isWithin24h) {
        setRefundAge(`${hours}h ${minutes}m ago`);
      } else {
        setRefundAge("Over 24 hours ago");
      }
    };

    updateAge();
    const interval = setInterval(updateAge, 60000);
    return () => clearInterval(interval);
  }, [escrow.refundedAt]);

  return (
    <>
      <div className="p-3 rounded-md bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 flex items-center gap-2">
        <CheckCircle className="h-4 w-4" />
        <span className="text-sm">Order refunded to your wallet</span>
      </div>
      {escrow.refundedAt && (
        <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-xs">
          Refund initiated: {refundAge} • {new Date(escrow.refundedAt).toLocaleString()}
        </div>
      )}
    </>
  );
}

function CountdownTimer({ expiresAt }: { expiresAt: string }) {
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

      setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
      <Clock className="h-4 w-4" />
      <span className="font-mono font-medium">{timeLeft}</span>
    </div>
  );
}

function EscrowCard({ escrow, onRefresh }: { escrow: EscrowOrder; onRefresh: () => void }) {
  const { toast } = useToast();
  const [showDisputeDialog, setShowDisputeDialog] = useState(false);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [buyerWalletAddress, setBuyerWalletAddress] = useState(escrow.buyerRefundAddress || "");
  const [txHash, setTxHash] = useState("");
  const [snapshot, setSnapshot] = useState<PurchaseSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  // Fetch product snapshot when escrow is in "escrow" status
  useEffect(() => {
    if (escrow.status === "escrow") {
      setSnapshotLoading(true);
      fetch(`/api/escrow/${escrow.id}/snapshot`, { credentials: "include" })
        .then(res => res.ok ? res.json() : null)
        .then(data => setSnapshot(data))
        .catch(() => {})
        .finally(() => setSnapshotLoading(false));
    }
  }, [escrow.id, escrow.status]);

  const confirmMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/escrow/${escrow.id}/confirm`);
    },
    onSuccess: () => {
      toast({ title: "Delivery confirmed!", description: "Funds have been released to the merchant." });
      queryClient.invalidateQueries({ queryKey: ["/api/escrow/buyer"] });
      onRefresh();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to confirm delivery", variant: "destructive" });
    },
  });

  // Check if early confirmation is allowed
  const isEarlyConfirmLocked = () => {
    if (!escrow.escrowExpiresAt) return false;
    const now = new Date().getTime();
    const expires = new Date(escrow.escrowExpiresAt).getTime();
    return expires > now && !escrow.earlyApprovalEnabled;
  };

  const disputeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/escrow/${escrow.id}/dispute`, { reason: disputeReason });
    },
    onSuccess: () => {
      toast({ title: "Dispute submitted", description: "Admin will review your case." });
      setShowDisputeDialog(false);
      setDisputeReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/escrow/buyer"] });
      queryClient.invalidateQueries({ queryKey: ["/api/disputes"] });
      onRefresh();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to submit dispute", variant: "destructive" });
    },
  });

  const verifyByTxHashMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/escrow/${escrow.id}/verify-by-txhash`, { 
        txHash,
        buyerWalletAddress: buyerWalletAddress || undefined 
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Payment Verified!",
        description: `Transaction confirmed with ${data.confirmations || 0} confirmations.`,
      });
      setShowVerifyDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/escrow/buyer"] });
      queryClient.invalidateQueries({ queryKey: ["/api/escrow/seller"] });
    },
    onError: (error: any) => {
      toast({
        title: "Verification Failed",
        description: error.message || "Could not verify transaction. Check the hash and try again.",
        variant: "destructive",
      });
    },
  });

  const verifyPaymentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/escrow/${escrow.id}/verify-payment`, { 
        buyerWalletAddress: buyerWalletAddress || undefined 
      });
    },
    onSuccess: (data: any) => {
      toast({ 
        title: "Payment Verified!", 
        description: `Transaction found: ${data.txHash?.substring(0, 16)}...` 
      });
      setShowVerifyDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/escrow/buyer"] });
      onRefresh();
    },
    onError: (error: any) => {
      toast({ 
        title: "Payment not found", 
        description: error.message || "Make sure you sent the exact amount to the deposit address", 
        variant: "destructive" 
      });
    },
  });

  const searchPaymentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/escrow/${escrow.id}/search-payment`, { 
        buyerWalletAddress 
      });
    },
    onSuccess: (data: any) => {
      if (data.found) {
        toast({ 
          title: "Payment Found!", 
          description: `Transaction: ${data.txHash?.substring(0, 16)}... (${data.confirmations} confirmations)` 
        });
      } else {
        toast({ 
          title: "No payment found", 
          description: "Could not find matching transaction from your wallet",
          variant: "destructive"
        });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Search failed", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/escrow/${escrow.id}/cancel`);
    },
    onSuccess: () => {
      toast({ title: "Payment cancelled", description: "Your order has been cancelled." });
      queryClient.invalidateQueries({ queryKey: ["/api/escrow/buyer"] });
      onRefresh();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to cancel order", variant: "destructive" });
    },
  });



  const copyAddress = () => {
    navigator.clipboard.writeText(escrow.depositAddress);
    toast({ title: "Copied!", description: "Deposit address copied to clipboard" });
  };

  const getStatusBadge = () => {
    switch (escrow.status) {
      case "pending_payment":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">Awaiting Payment</Badge>;
      case "escrow":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">In Escrow</Badge>;
      case "confirmed":
        return <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">Confirmed</Badge>;
      case "released":
        return <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">Released</Badge>;
      case "disputed":
        return <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">Disputed</Badge>;
      case "refunded":
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">Refunded</Badge>;
      case "cancelled":
        return <Badge variant="outline" className="bg-gray-50 text-gray-700 dark:bg-gray-950 dark:text-gray-300">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{escrow.status}</Badge>;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            {escrow.coinSymbol === "BNB" ? (
              <SiBinance className="h-5 w-5 text-yellow-500" />
            ) : escrow.coinSymbol === "USDT" ? (
              <div className="h-5 w-5 text-green-500 font-bold text-sm flex items-center justify-center">₮</div>
            ) : (
              <Bitcoin className="h-5 w-5 text-orange-500" />
            )}
            Order #{escrow.orderId.substring(0, 8)}
          </CardTitle>
          <CardDescription>
            Merchant: {escrow.merchant?.username || "Unknown"}
          </CardDescription>
        </div>
        {getStatusBadge()}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Amount ({escrow.coinSymbol || "BTC"})</p>
            <p className="font-mono font-bold text-lg" data-testid="text-crypto-amount">
              {(escrow.cryptoAmount || escrow.btcAmount).toFixed(escrow.coinSymbol === "USDT" || escrow.coinSymbol === "BNB" ? 6 : 8)} {escrow.coinSymbol || "BTC"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Amount (USD)</p>
            <p className="font-bold text-lg" data-testid="text-usd-amount">${parseFloat(escrow.usdAmount).toFixed(2)}</p>
          </div>
        </div>

        {escrow.status === "pending_payment" && (
          <div className="space-y-3 p-3 rounded-md bg-muted/50">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">Send {escrow.coinSymbol === "BTC" ? "Bitcoin" : escrow.coinSymbol === "BNB" ? "BNB (BSC Network)" : "USDT (BEP20 on BSC)"} to this address:</span>
            </div>
            
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 bg-white rounded-lg">
                <QRCode 
                  value={escrow.coinSymbol === "BTC" 
                    ? `bitcoin:${escrow.depositAddress}?amount=${escrow.btcAmount}`
                    : escrow.depositAddress
                  }
                  size={140}
                  data-testid="qr-deposit-address"
                />
              </div>
              
              <div className="w-full space-y-2">
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-background rounded text-xs break-all" data-testid="text-deposit-address">
                    {escrow.depositAddress}
                  </code>
                  <Button size="icon" variant="ghost" onClick={copyAddress} data-testid="button-copy-address">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="p-2 rounded-md bg-background text-center">
                  <p className="text-xs text-muted-foreground">Amount to send:</p>
                  <p className="font-mono font-bold text-base">
                    {(escrow.cryptoAmount || escrow.btcAmount).toFixed(escrow.coinSymbol === "USDT" || escrow.coinSymbol === "BNB" ? 6 : 8)} {escrow.coinSymbol || "BTC"}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="walletAddress" className="text-sm">Your {escrow.coinSymbol === "BTC" ? "Bitcoin" : escrow.coinSymbol === "BNB" ? "BNB" : "USDT BEP20"} Wallet Address (required)</Label>
              <Input
                id="walletAddress"
                placeholder={escrow.coinSymbol === "BNB" || escrow.coinSymbol === "USDT" ? "0x..." : "bc1q... or 1... or 3..."}
                value={buyerWalletAddress}
                onChange={(e) => setBuyerWalletAddress(e.target.value)}
                className="text-sm"
                data-testid="input-wallet-address-escrow"
              />
              <p className="text-xs text-muted-foreground">
                {escrow.coinSymbol === "USDT" ? "Enter your BSC wallet address that sent USDT" : escrow.coinSymbol === "BNB" ? "Enter your BSC network wallet address" : "Enter the wallet address you sent payment from"}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="txHashDirect" className="text-sm">Transaction Hash (required)</Label>
              <Input
                id="txHashDirect"
                placeholder={escrow.coinSymbol === "BNB" || escrow.coinSymbol === "USDT" ? "0x..." : "Enter TX hash..."}
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                className="text-sm"
                data-testid="input-tx-hash-direct"
              />
              <p className="text-xs text-muted-foreground">
                {escrow.coinSymbol === "USDT" ? "Enter the BSC transaction hash after sending USDT" : "Paste your transaction hash after sending payment"}
              </p>
            </div>

            <Button 
              className="w-full"
              onClick={() => verifyByTxHashMutation.mutate()}
              disabled={!txHash.trim() || !buyerWalletAddress.trim() || verifyByTxHashMutation.isPending}
              data-testid="button-verify-tx-direct"
            >
              {verifyByTxHashMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Verifying...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Verify Payment
                </>
              )}
            </Button>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex-1 h-px bg-border" />
              <span>or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <Button 
              variant="secondary"
              className="w-full"
              onClick={() => verifyPaymentMutation.mutate()}
              disabled={!buyerWalletAddress.trim() || verifyPaymentMutation.isPending}
              data-testid="button-auto-search"
            >
              {verifyPaymentMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Auto-Search for Payment
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Don't have the TX hash? We can search for your payment automatically.
            </p>
              
            <Button 
              variant="outline"
              className="w-full" 
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              data-testid="button-cancel-payment"
            >
              {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
              Cancel Order
            </Button>
          </div>
        )}

        {escrow.status === "cancelled" && (
          <div className="p-3 rounded-md bg-gray-50 dark:bg-gray-950 text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <XCircle className="h-4 w-4" />
            <span className="text-sm">Order cancelled</span>
          </div>
        )}

        {escrow.status === "escrow" && escrow.escrowExpiresAt && (
          <div className="space-y-4">
            <div className="p-3 rounded-md bg-green-50 dark:bg-green-950 text-center">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400 mx-auto mb-1" />
              <p className="font-medium text-green-700 dark:text-green-300">Payment Verified - Product Purchased!</p>
            </div>

            {snapshotLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : snapshot && (
              <div className="space-y-3 p-3 rounded-md bg-muted/50">
                {snapshot.afterBuyMessage && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Message from seller:</p>
                    <p className="text-sm whitespace-pre-wrap" data-testid={`text-escrow-message-${escrow.id}`}>
                      {snapshot.afterBuyMessage}
                    </p>
                  </div>
                )}
                {snapshot.afterBuyButtonUrl && (
                  <Button asChild className="w-full" data-testid={`button-escrow-cta-${escrow.id}`}>
                    <a href={snapshot.afterBuyButtonUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      {snapshot.afterBuyButtonLabel || "Access Product"}
                    </a>
                  </Button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between p-3 rounded-md bg-orange-50 dark:bg-orange-950">
              <span className="text-sm font-medium">Escrow protection expires in:</span>
              <CountdownTimer expiresAt={escrow.escrowExpiresAt} />
            </div>
            
            {isEarlyConfirmLocked() && (
              <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-start gap-2">
                <Shield className="h-4 w-4 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">Early confirmation is locked</p>
                  <p className="text-blue-600 dark:text-blue-400">
                    For your protection, you can only confirm delivery after the 24-hour escrow period ends. 
                    If you received your product early and want to release funds, contact admin.
                  </p>
                </div>
              </div>
            )}
            
            <div className="flex gap-2">
              <Button 
                onClick={() => confirmMutation.mutate()} 
                disabled={confirmMutation.isPending || isEarlyConfirmLocked()}
                className="flex-1"
                data-testid="button-confirm-delivery"
              >
                {confirmMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                {isEarlyConfirmLocked() ? "Confirm (Locked)" : "Confirm Delivery"}
              </Button>
              
              <Dialog open={showDisputeDialog} onOpenChange={setShowDisputeDialog}>
                <DialogTrigger asChild>
                  <Button variant="destructive" className="flex-1" data-testid="button-open-dispute">
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Raise Dispute
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Raise a Dispute</DialogTitle>
                    <DialogDescription>
                      Explain why you want to dispute this order. An admin will review your case.
                    </DialogDescription>
                  </DialogHeader>
                  <Textarea
                    placeholder="Describe the issue..."
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    className="min-h-[100px]"
                    data-testid="input-dispute-reason"
                  />
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowDisputeDialog(false)}>Cancel</Button>
                    <Button 
                      variant="destructive" 
                      onClick={() => disputeMutation.mutate()}
                      disabled={!disputeReason || disputeMutation.isPending}
                      data-testid="button-submit-dispute"
                    >
                      {disputeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Submit Dispute
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        )}

        {escrow.status === "disputed" && (
          <div className="p-3 rounded-md bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 flex items-center gap-2">
            <XCircle className="h-4 w-4" />
            <span className="text-sm">Dispute under review by admin</span>
          </div>
        )}

        {escrow.status === "released" && (
          <div className="p-3 rounded-md bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">Funds released to merchant</span>
          </div>
        )}

        {escrow.status === "refunded" && (
          <RefundedDisplay escrow={escrow} />
        )}

        <p className="text-xs text-muted-foreground">
          Created: {new Date(escrow.createdAt).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}

function PurchasedCard({ escrow }: { escrow: EscrowOrder }) {
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState<PurchaseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSnapshot = async () => {
      try {
        const response = await fetch(`/api/escrow/${escrow.id}/snapshot`, { credentials: "include" });
        if (response.ok) {
          const data = await response.json();
          setSnapshot(data);
        }
      } catch (error) {
        console.error("Failed to fetch snapshot:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSnapshot();
  }, [escrow.id]);

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-green-600" />
            {snapshot?.productName || `Order #${escrow.orderId.substring(0, 8)}`}
          </CardTitle>
          <CardDescription>
            Purchased from: {escrow.merchant?.username || "Unknown"}
          </CardDescription>
        </div>
        <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
          <CheckCircle className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : snapshot ? (
          <>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Amount Paid</p>
                <p className="font-mono font-bold">
                  {(escrow.cryptoAmount || escrow.btcAmount).toFixed(escrow.coinSymbol === "BNB" ? 6 : 8)} {escrow.coinSymbol || "BTC"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">USD Value</p>
                <p className="font-bold">${parseFloat(escrow.usdAmount).toFixed(2)}</p>
              </div>
            </div>

            {snapshot.afterBuyMessage && (
              <div className="p-4 rounded-md bg-muted space-y-2">
                <p className="text-sm font-medium">Message from seller:</p>
                <p className="text-sm whitespace-pre-wrap" data-testid={`text-purchased-message-${escrow.id}`}>
                  {snapshot.afterBuyMessage}
                </p>
              </div>
            )}

            {snapshot.afterBuyButtonUrl && (
              <Button asChild className="w-full" data-testid={`button-purchased-cta-${escrow.id}`}>
                <a href={snapshot.afterBuyButtonUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {snapshot.afterBuyButtonLabel || "Access Product"}
                </a>
              </Button>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Product details not available</p>
        )}

        <p className="text-xs text-muted-foreground">
          Completed: {escrow.releasedAt ? new Date(escrow.releasedAt).toLocaleString() : new Date(escrow.createdAt).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}

export default function EscrowPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  const { data: escrowOrders, isLoading, refetch } = useQuery<EscrowOrder[]>({
    queryKey: ["/api/escrow/buyer"],
    enabled: !!user,
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  const activeOrders = escrowOrders?.filter(e => ["pending_payment", "escrow", "disputed"].includes(e.status)) || [];
  const purchasedOrders = escrowOrders?.filter(e => ["released"].includes(e.status)) || [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Shield className="h-8 w-8 text-primary" />
              My Escrow Orders
            </h1>
            <p className="text-muted-foreground mt-1">
              Track your crypto purchases with escrow protection
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : escrowOrders && escrowOrders.length > 0 ? (
          <Tabs defaultValue="active" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="active" data-testid="tab-active-orders">
                Active ({activeOrders.length})
              </TabsTrigger>
              <TabsTrigger value="purchased" data-testid="tab-purchased-orders">
                Purchased ({purchasedOrders.length})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="active" className="space-y-4">
              {activeOrders.length > 0 ? (
                activeOrders.map((escrow) => (
                  <EscrowCard key={escrow.id} escrow={escrow} onRefresh={refetch} />
                ))
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Shield className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No active orders</h3>
                    <p className="text-muted-foreground text-center mt-2">
                      You don't have any orders in progress.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
            
            <TabsContent value="purchased" className="space-y-4">
              {purchasedOrders.length > 0 ? (
                purchasedOrders.map((escrow) => (
                  <PurchasedCard key={escrow.id} escrow={escrow} />
                ))
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Package className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No completed purchases</h3>
                    <p className="text-muted-foreground text-center mt-2">
                      Your completed purchases will appear here.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Shield className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No escrow orders yet</h3>
              <p className="text-muted-foreground text-center mt-2">
                When you make a purchase with cryptocurrency, your escrow orders will appear here.
              </p>
              <Button onClick={() => setLocation("/")} className="mt-4" data-testid="button-browse-products">
                Browse Products
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
