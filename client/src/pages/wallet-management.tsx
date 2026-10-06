import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowDown, ArrowUp, Send, Copy, Loader2, RefreshCw, Plus, History, Zap, X, ExternalLink, Check } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Wallet {
  id: string;
  userId: string;
  address: string;
  usdtBalance: number;
  createdAt: string;
}

interface SendTransaction {
  recipientAddress: string;
  amount: number;
  description?: string;
}

interface ReceiveData {
  address: string;
  qrCode?: string;
}

interface PaymentHistoryItem {
  id: string;
  type: string;
  amount: number;
  date: string;
  description: string;
  balanceAfter: number;
  transactionHash?: string;
  coinSymbol?: string;
  status?: string;
  relatedUser?: { username: string };
  relatedUserType?: string;
}

export default function WalletManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"send" | "receive" | "buy" | "history">("send");
  const [selectedCoin] = useState("USDT");
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [showGasFeeDialog, setShowGasFeeDialog] = useState(false);
  const [gasFeeStatus, setGasFeeStatus] = useState<{ hasGasFee: boolean; bnbBalance: number } | null>(null);

  const { data: wallet, isLoading: walletLoading, refetch: refetchWallet } = useQuery({
    queryKey: ["/api/wallet/get"],
    queryFn: async () => {
      const res = await fetch("/api/wallet/get");
      if (!res.ok) throw new Error("Failed to fetch wallet");
      return res.json();
    },
    enabled: !!user,
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  const { data: paymentHistory, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ["/api/wallet/payment-history"],
    queryFn: async () => {
      const res = await fetch("/api/wallet/payment-history");
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    enabled: !!user && activeTab === "history",
  });

  // Auto-refresh balance every 10 seconds
  useEffect(() => {
    if (wallet && user) {
      const interval = setInterval(() => {
        refetchWallet();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [wallet, user, refetchWallet]);

  const { data: receiveData } = useQuery({
    queryKey: ["/api/wallet/receive-address"],
    queryFn: async () => {
      const res = await fetch("/api/wallet/receive-address");
      if (!res.ok) throw new Error("Failed to fetch receive address");
      return res.json();
    },
    enabled: !!user && activeTab === "receive",
  });

  const { data: gasFeeData, isLoading: gasFeeLoading, refetch: refetchGasFee } = useQuery({
    queryKey: ["/api/wallet/gas-fee/status"],
    queryFn: async () => {
      const res = await fetch("/api/wallet/gas-fee/status");
      if (!res.ok) throw new Error("Failed to fetch gas fee status");
      return res.json();
    },
    enabled: !!user,
    retry: 2,
    refetchInterval: 3000, // Auto-refresh every 3 seconds for real-time BNB balance
  });

  // Auto-refresh gas fee status every 3 seconds for real-time BNB updates
  useEffect(() => {
    if (user) {
      const interval = setInterval(() => {
        refetchGasFee();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [user, refetchGasFee]);

  const requestGasFeeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/wallet/gas-fee/request");
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to request gas fee");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Gas fee sent successfully!", description: "0.000008 BNB received. 0.01 USDT deducted from your wallet." });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/gas-fee/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/get"] });
      setShowGasFeeDialog(false);
    },
    onError: (error: any) => {
      toast({ 
        title: "Gas fee request failed", 
        description: error.message || "Unable to send gas fee",
        variant: "destructive" 
      });
    },
  });

  const createWalletMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/wallet/create");
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create wallet");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: "Wallet created successfully!" });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/get"] });
    },
    onError: (error: any) => {
      const errorMsg = error?.message || "Failed to create wallet";
      console.error("[Wallet Creation Error]", error);
      toast({ 
        title: "Wallet Creation Failed", 
        description: errorMsg,
        variant: "destructive" 
      });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (data: SendTransaction) => {
      const response = await apiRequest("POST", "/api/wallet/send", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Transaction sent successfully!" });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/get"] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Transaction failed", 
        description: error.message || "Unable to send transaction",
        variant: "destructive" 
      });
    },
  });

  const handleCopyAddress = () => {
    if (wallet?.address) {
      navigator.clipboard.writeText(wallet.address);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
      toast({ title: "Address copied to clipboard!" });
    }
  };

  const handleCreateWallet = () => {
    createWalletMutation.mutate();
  };

  if (!user) {
    setLocation("/login");
    return null;
  }

  if (walletLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  // If no wallet exists, show creation screen
  if (!wallet) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-900/20 to-background">
        <Navbar />
        <main className="container max-w-md mx-auto px-4 py-12">
          <Card className="border-0 shadow-lg">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Create Your Wallet</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Set up a secure BEP-20 USDT wallet to send and receive funds
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 p-4 rounded-lg">
                <p className="text-sm text-center">
                  Your wallet will be created with a unique seed phrase stored securely on our servers
                </p>
              </div>
              <Button 
                onClick={handleCreateWallet}
                disabled={createWalletMutation.isPending}
                size="lg"
                className="w-full"
              >
                {createWalletMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Wallet
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900/20 to-background">
      <Navbar />
      <main className="container max-w-md mx-auto px-4 py-8">
        {/* Gas Fee Section */}
        {gasFeeLoading ? (
          <Card className="border-0 shadow-lg mb-4 bg-muted/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin" />
                <p className="text-sm text-muted-foreground">Loading gas fee status...</p>
              </div>
            </CardContent>
          </Card>
        ) : gasFeeData ? (
          <Card className={`border-0 shadow-lg mb-4 ${gasFeeData.hasGasFee ? 'bg-green-600/20 border-green-600/50' : 'bg-orange-600/20 border-orange-600/50'} border`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Zap className={`h-5 w-5 ${gasFeeData.hasGasFee ? 'text-green-600' : 'text-orange-600'}`} />
                  <div>
                    <p className="text-sm font-medium">{gasFeeData.hasGasFee ? 'Gas Fee Ready' : 'No Gas Fee'}</p>
                    <p className="text-xs text-muted-foreground">{gasFeeData.bnbBalance.toFixed(8)} BNB</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowGasFeeDialog(true)}
                >
                  + Add
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Gas Fee Dialog */}
        <Dialog open={showGasFeeDialog} onOpenChange={setShowGasFeeDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Add Gas Fee to Wallet
              </DialogTitle>
              <DialogDescription>
                Send BNB to your wallet to cover transaction gas fees
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="text-sm font-medium">Manual Method</p>
                <p className="text-xs text-muted-foreground">Send BNB to your wallet address to add gas fees manually</p>
              </div>
              <div className="border-t pt-4 space-y-2">
                <p className="text-sm font-medium">Automatic Method</p>
                <p className="text-xs text-muted-foreground mb-3">System sends 0.000008 BNB to your wallet. Fee: 0.01 USDT (deducted from balance)</p>
                <Button
                  onClick={() => requestGasFeeMutation.mutate()}
                  disabled={requestGasFeeMutation.isPending}
                  className="w-full"
                >
                  {requestGasFeeMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      Auto-Send Gas Fee
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Balance Card */}
        <Card className="border-0 shadow-lg mb-6 bg-gradient-to-br from-purple-600 to-blue-600 text-white">
          <CardContent className="pt-6">
            <p className="text-sm opacity-90 mb-2">Wallet Balance</p>
            <h1 className="text-4xl font-bold mb-2">{wallet.usdtBalance.toFixed(2)}</h1>
            <p className="text-sm opacity-75">{selectedCoin} on BEP-20</p>
            
            <div className="mt-6 p-3 bg-white/10 rounded-lg text-xs">
              <p className="opacity-75 mb-1">Wallet Address</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all font-mono text-xs">{wallet.address}</code>
                <button
                  onClick={handleCopyAddress}
                  className="p-2 hover:bg-white/20 rounded transition"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons (Floating Circles Style) */}
        <div className="flex gap-4 justify-center mb-8 flex-wrap">
          <button
            onClick={() => setActiveTab("send")}
            className={`flex flex-col items-center gap-2 p-4 rounded-full transition ${
              activeTab === "send"
                ? "bg-purple-600 text-white shadow-lg scale-110"
                : "bg-muted hover:bg-muted/80"
            }`}
          >
            <ArrowUp className="h-6 w-6" />
            <span className="text-xs font-medium">Send</span>
          </button>
          <button
            onClick={() => setActiveTab("receive")}
            className={`flex flex-col items-center gap-2 p-4 rounded-full transition ${
              activeTab === "receive"
                ? "bg-purple-600 text-white shadow-lg scale-110"
                : "bg-muted hover:bg-muted/80"
            }`}
          >
            <ArrowDown className="h-6 w-6" />
            <span className="text-xs font-medium">Receive</span>
          </button>
          <button
            onClick={() => setActiveTab("buy")}
            className={`flex flex-col items-center gap-2 p-4 rounded-full transition ${
              activeTab === "buy"
                ? "bg-purple-600 text-white shadow-lg scale-110"
                : "bg-muted hover:bg-muted/80"
            }`}
          >
            <Plus className="h-6 w-6" />
            <span className="text-xs font-medium">Buy</span>
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex flex-col items-center gap-2 p-4 rounded-full transition ${
              activeTab === "history"
                ? "bg-purple-600 text-white shadow-lg scale-110"
                : "bg-muted hover:bg-muted/80"
            }`}
          >
            <History className="h-6 w-6" />
            <span className="text-xs font-medium">History</span>
          </button>
        </div>

        {/* Coin Display */}
        <div className="text-center mb-8 p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground">Selected Coin</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
              U
            </div>
            <span className="font-semibold">{selectedCoin}</span>
            <span className="text-sm text-muted-foreground">{wallet.usdtBalance} {selectedCoin}</span>
          </div>
        </div>

        {/* Send Tab */}
        {activeTab === "send" && (
          <SendTab wallet={wallet} onSend={sendMutation.mutate} isLoading={sendMutation.isPending} />
        )}

        {/* Receive Tab */}
        {activeTab === "receive" && (
          <ReceiveTab wallet={wallet} receiveData={receiveData} onCopyAddress={handleCopyAddress} />
        )}

        {/* Buy Tab */}
        {activeTab === "buy" && (
          <BuyTab wallet={wallet} user={user} />
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <HistoryTab history={paymentHistory || []} isLoading={historyLoading} onRefresh={() => refetchHistory()} />
        )}
      </main>
    </div>
  );
}

function SendTab({ wallet, onSend, isLoading }: any) {
  const [recipientAddress, setRecipientAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const handleSend = () => {
    if (!recipientAddress || !amount) {
      alert("Please fill in all fields");
      return;
    }
    onSend({
      recipientAddress,
      amount: parseFloat(amount),
      description,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Send USDT</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium">Recipient Address</label>
          <input
            type="text"
            placeholder="0x..."
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Amount (USDT)</label>
          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
          />
          <p className="text-xs text-muted-foreground mt-1">Available: {wallet.usdtBalance}</p>
        </div>
        <div>
          <label className="text-sm font-medium">Description (Optional)</label>
          <input
            type="text"
            placeholder="Add a note..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
          />
        </div>
        <Button onClick={handleSend} disabled={isLoading} className="w-full">
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Send USDT
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function ReceiveTab({ wallet, receiveData, onCopyAddress }: any) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Receive USDT</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-muted p-4 rounded-lg text-center">
          <p className="text-sm text-muted-foreground mb-2">Your Wallet Address</p>
          <code className="text-sm font-mono break-all block mb-3">{wallet.address}</code>
          <Button
            onClick={onCopyAddress}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy Address
          </Button>
        </div>
        <div className="text-sm text-muted-foreground text-center">
          <p>Share this address to receive USDT on BEP-20 network</p>
        </div>
      </CardContent>
    </Card>
  );
}

function BuyTab({ wallet, user }: any) {
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversionRate] = useState(0.01); // 100 INR = 1 USD
  const [feePercentage] = useState(0.07); // 7% fee
  const [staticFee] = useState(150); // Fixed ₹150 per transaction
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(1200); // 20 minutes in seconds
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const { toast } = useToast();

  // Load session from localStorage on mount and validate with backend
  useEffect(() => {
    const loadAndValidateSession = async () => {
      const savedSession = localStorage.getItem("paymentSession");
      if (savedSession) {
        try {
          const { id, expiresAt, paymentLink: link, walletAddress: addr, userId: sessionUserId } = JSON.parse(savedSession);
          
          // Validate that the session belongs to the current user
          if (sessionUserId !== user?.id) {
            console.log("Session belongs to different user, clearing it");
            localStorage.removeItem("paymentSession");
            return;
          }
          
          const now = new Date().getTime();
          const expiryTime = new Date(expiresAt).getTime();
          
          if (expiryTime > now) {
            // Check with backend to verify session is still active
            try {
              const res = await fetch(`/api/wallet/payment-session/${id}`);
              const data = await res.json();
              
              // If session is already completed or doesn't exist, clear it
              if (data.status === "completed" || data.status === "expired" || res.status === 404) {
                localStorage.removeItem("paymentSession");
                return;
              }
              
              // Session still valid
              const remainingSeconds = Math.floor((expiryTime - now) / 1000);
              setSessionId(id);
              setPaymentLink(link);
              setWalletAddress(addr);
              setTimeLeft(remainingSeconds);
            } catch (error) {
              console.error("Error validating session with backend:", error);
              localStorage.removeItem("paymentSession");
            }
          } else {
            // Session expired
            localStorage.removeItem("paymentSession");
          }
        } catch (error) {
          console.error("Error loading session:", error);
          localStorage.removeItem("paymentSession");
        }
      }
    };
    
    loadAndValidateSession();
  }, [user?.id]);

  // Save session to localStorage whenever it changes
  useEffect(() => {
    if (sessionId && paymentLink && walletAddress) {
      const expiresAt = new Date(Date.now() + timeLeft * 1000);
      localStorage.setItem("paymentSession", JSON.stringify({
        id: sessionId,
        expiresAt: expiresAt.toISOString(),
        paymentLink,
        walletAddress,
        userId: user?.id
      }));
    }
  }, [sessionId, paymentLink, walletAddress, timeLeft, user?.id]);

  // Poll session status - stops timer when payment received
  useEffect(() => {
    if (!sessionId) return;
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/wallet/payment-session/${sessionId}`);
        const data = await res.json();
        
        if (data.status === "completed") {
          toast({ 
            title: "✅ Payment Received!", 
            description: `${data.receivedUsdtAmount} USDT received and forwarded to your wallet`,
          });
          // ⏹️ Timer stops immediately when payment is forwarded
          setSessionId(null);
          setPaymentLink(null);
          setWalletAddress(null);
          setTimeLeft(1200);
          localStorage.removeItem("paymentSession");
        }
      } catch (error) {
        console.error("Error polling session:", error);
      }
    }, 1000); // Poll every 1 second for faster detection

    return () => clearInterval(pollInterval);
  }, [sessionId, toast]);

  // Countdown timer
  useEffect(() => {
    if (!sessionId) return;
    const timerInterval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setSessionId(null);
          setPaymentLink(null);
          setWalletAddress(null);
          localStorage.removeItem("paymentSession");
          toast({ 
            title: "⏱️ Payment Window Expired", 
            description: "20 minutes have passed. The wallet has been released.",
            variant: "destructive" 
          });
          return 1200;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [sessionId, toast]);

  // Calculate USDT equivalent in real-time (after ₹150 fixed fee + 7% fee deduction)
  const calculateUSDT = (inrAmount: string) => {
    const inr = parseFloat(inrAmount) || 0;
    const inrAfterFixedFee = inr - staticFee;
    const usdtBeforeFee = inrAfterFixedFee * conversionRate;
    const usdtAfterFee = usdtBeforeFee * (1 - feePercentage);
    return Math.max(0, usdtAfterFee).toFixed(6);
  };

  const handleBuyUSDT = async () => {
    const amountInr = parseFloat(amount);
    
    // Check if user already has an active payment session
    if (sessionId) {
      toast({ 
        title: "⏳ Payment Already in Progress", 
        description: "One of your payments are processing. Please wait for it to complete or for the timer to expire.",
        variant: "default" 
      });
      return;
    }
    
    if (!amount || amountInr < 1000) {
      toast({ 
        title: "Invalid Amount", 
        description: "Minimum purchase is ₹1000 INR for UPI payments",
        variant: "destructive" 
      });
      return;
    }

    setIsLoading(true);
    
    try {
      // Request wallet assignment from backend
      const inrAfterFixedFee = amountInr - staticFee;
      const usdtBeforeFee = inrAfterFixedFee * conversionRate;
      const usdtAfterFee = usdtBeforeFee * (1 - feePercentage);
      const usdtAmount = Math.max(0, usdtAfterFee).toFixed(6);
      const response = await fetch("/api/wallet/assign-payment-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestedAmount: amountInr,
          expectedUsdtAmount: parseFloat(usdtAmount),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      const data = await response.json();
      const { wallet, session } = data;

      // Store session ID and start countdown
      setSessionId(session.id);
      setPaymentLink(wallet.paymentLink);
      setWalletAddress(wallet.address);
      setTimeLeft(1200);

      // Open payment link in new tab
      window.open(wallet.paymentLink, "_blank");
      
      toast({ 
        title: "Payment Window Opened!", 
        description: `Waiting for payment... You have 20 minutes.`,
      });
      
      setAmount("");
    } catch (error: any) {
      const errorMsg = error.message || "Failed to initiate payment";
      if (errorMsg.includes("No available")) {
        toast({ 
          title: "⏳ Server in High Demand", 
          description: "All payment wallets are currently in use. Please wait a few moments and try again.",
          variant: "destructive" 
        });
      } else {
        toast({ 
          title: "Error", 
          description: errorMsg,
          variant: "destructive" 
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const usdtAmount = calculateUSDT(amount);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const handlePayNow = () => {
    if (paymentLink) {
      window.open(paymentLink, "_blank");
      toast({
        title: "Payment Link Opened",
        description: "Please complete your payment in the new window"
      });
    }
  };

  return (
    <>
      {sessionId && (
        <Card className="border-2 border-blue-500 bg-blue-50 dark:bg-blue-950/30">
          <CardHeader>
            <CardTitle className="text-lg text-blue-700 dark:text-blue-400">⏳ Waiting for Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Payment Window Active</p>
              <p className="text-4xl font-bold text-blue-600">{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</p>
              <p className="text-xs text-muted-foreground mt-2">Send USDT to the address shown in the payment link</p>
            </div>
            <div className="bg-muted p-3 rounded-lg text-sm">
              <p className="font-medium mb-1">What happens next:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>✓ Timer counting down your 20-minute window</li>
                <li>✓ Payment received → Auto-forwarded to your wallet</li>
                <li>✓ Wallet auto-released after forwarding</li>
              </ul>
            </div>
            <Button 
              onClick={handlePayNow}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              💳 Pay Now (Retry)
            </Button>
          </CardContent>
        </Card>
      )}

      {!sessionId && <Card>
        <CardHeader>
          <CardTitle className="text-lg">Buy USDT with INR</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-lg">
            <p className="text-sm text-green-700 dark:text-green-400">
              ✨ Instant Purchase with Ramp
            </p>
            <p className="text-xs text-green-600 dark:text-green-500 mt-1">
              Quick UPI & Card payments • Instant delivery • Secure
            </p>
          </div>
          
          <div>
            <label className="text-sm font-medium">Amount (INR)</label>
            <input
              type="number"
              placeholder="Enter amount (₹1000 minimum)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
              min="1000"
              step="100"
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Minimum: ₹1000 | Wallet: {wallet.address.substring(0, 10)}...
            </p>
          </div>

          {amount && (
            <div className="bg-muted p-3 rounded-lg border">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">You will receive:</span>
                <span className="text-lg font-bold text-green-600">
                  {usdtAmount} USDT
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Rate: 1 INR ≈ {conversionRate} USDT
              </p>
            </div>
          )}

          <div className="bg-muted p-3 rounded-lg space-y-2 text-sm">
            <p className="font-medium">🔒 Payment Details:</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>✓ Wallet: {wallet.address.substring(0, 12)}...</li>
              <li>✓ Crypto: USDT (BEP-20)</li>
              <li>✓ Network: BSC</li>
              <li>✓ Payment: UPI / Cards / Bank</li>
            </ul>
          </div>

          <Button 
            onClick={handleBuyUSDT} 
            disabled={isLoading || !amount} 
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Link...
              </>
            ) : (
              <>
                <ExternalLink className="mr-2 h-4 w-4" />
                Buy {usdtAmount || "0"} USDT Now
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Instant payment processing with Ramp
          </p>
        </CardContent>
      </Card>
      }
    </>
  );
}

function HistoryTab({ history, isLoading, onRefresh }: { history: PaymentHistoryItem[]; isLoading: boolean; onRefresh: () => void }) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!history || history.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-muted-foreground">No transactions yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Transaction History</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2">Type</th>
                <th className="text-left py-2 px-2">Amount</th>
                <th className="text-left py-2 px-2">Coin</th>
                <th className="text-left py-2 px-2">Date</th>
                <th className="text-left py-2 px-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((tx) => (
                <tr key={tx.id} className="border-b hover:bg-muted/50">
                  <td className="py-2 px-2">
                    <Collapsible className="w-full">
                      <CollapsibleTrigger asChild>
                        <div className="cursor-pointer text-blue-600 hover:underline text-xs font-medium">
                          {tx.type}
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="col-span-5 mt-2 p-2 bg-muted rounded text-xs space-y-1">
                        {tx.description && <p><strong>Description:</strong> {tx.description}</p>}
                        {tx.transactionHash && <p><strong>Hash:</strong> <code className="text-xs break-all">{tx.transactionHash.substring(0, 16)}...</code></p>}
                        {tx.relatedUser && <p><strong>With:</strong> {tx.relatedUser.username} ({tx.relatedUserType})</p>}
                        <p><strong>Balance After:</strong> {tx.balanceAfter.toFixed(6)}</p>
                      </CollapsibleContent>
                    </Collapsible>
                  </td>
                  <td className="py-2 px-2 font-mono font-bold">{tx.amount.toFixed(6)}</td>
                  <td className="py-2 px-2">{tx.coinSymbol || "USDT"}</td>
                  <td className="py-2 px-2 text-xs text-muted-foreground">
                    {new Date(tx.date).toLocaleDateString()}
                  </td>
                  <td className="py-2 px-2">
                    <span className="text-xs px-2 py-1 rounded-full bg-muted">{tx.status || "completed"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
