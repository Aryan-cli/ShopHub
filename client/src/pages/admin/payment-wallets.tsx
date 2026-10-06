import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Copy, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function PaymentWalletsAdmin() {
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [address, setAddress] = useState("");
  const [seedPhrase, setSeedPhrase] = useState("");
  const [paymentLink, setPaymentLink] = useState("");
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({});
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null);

  const { data: wallets = [], refetch } = useQuery({
    queryKey: ["/api/admin/payment-wallets/list"],
    queryFn: async () => {
      const res = await fetch("/api/admin/payment-wallets/list");
      if (!res.ok) throw new Error("Failed to fetch wallets");
      const data = await res.json();
      return data.wallets || [];
    },
    refetchInterval: 5000, // Auto-reload wallet list every 5 seconds
  });

  // Fetch live USDT balances for all wallets
  useEffect(() => {
    if (wallets.length === 0) return;

    const fetchBalances = async () => {
      const balances: Record<string, number> = {};
      for (const wallet of wallets) {
        try {
          const res = await fetch(`/api/admin/payment-wallets/${wallet.id}/balance`);
          if (res.ok) {
            const balanceData = await res.json();
            balances[wallet.id] = balanceData.balance;
          }
        } catch (error) {
          console.error(`Failed to fetch balance for ${wallet.id}:`, error);
        }
      }
      setWalletBalances(balances);
    };

    fetchBalances();
    // Refresh balances every 10 seconds
    const interval = setInterval(fetchBalances, 10000);
    return () => clearInterval(interval);
  }, [wallets]);

  const handleAddWallet = async () => {
    if (!address || !seedPhrase || !paymentLink) {
      toast({ title: "Error", description: "All fields required", variant: "destructive" });
      return;
    }

    setIsAdding(true);
    try {
      const res = await fetch("/api/admin/payment-wallets/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, seedPhrase, paymentLink }),
      });

      if (!res.ok) throw new Error(await res.text());

      toast({ title: "Success", description: "Wallet added" });
      setAddress("");
      setSeedPhrase("");
      setPaymentLink("");
      setShowAddForm(false);
      refetch();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  const handleEditWallet = (wallet: any) => {
    setEditingWalletId(wallet.id);
    setAddress(wallet.address);
    setSeedPhrase("");
    setPaymentLink(wallet.paymentLink);
    setShowEditForm(true);
  };

  const handleUpdateWallet = async () => {
    if (!address || !seedPhrase || !paymentLink) {
      toast({ title: "Error", description: "All fields required", variant: "destructive" });
      return;
    }

    setIsEditing(true);
    try {
      const res = await fetch(`/api/admin/payment-wallets/${editingWalletId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, seedPhrase, paymentLink }),
      });

      if (!res.ok) throw new Error(await res.text());

      toast({ title: "Success", description: "Wallet updated" });
      setAddress("");
      setSeedPhrase("");
      setPaymentLink("");
      setShowEditForm(false);
      setEditingWalletId(null);
      refetch();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteWallet = async (walletId: string) => {
    if (!confirm("Are you sure you want to delete this wallet?")) return;

    try {
      const res = await fetch(`/api/admin/payment-wallets/${walletId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error(await res.text());

      toast({ title: "Success", description: "Wallet deleted" });
      refetch();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleClearTimer = async (walletId: string) => {
    try {
      const res = await fetch(`/api/admin/payment-wallets/${walletId}/clear-timer`, {
        method: "POST",
      });

      if (!res.ok) throw new Error(await res.text());

      toast({ title: "Success", description: "Timer cleared and wallet released" });
      refetch();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Payment Wallets</h2>
        <Button onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="mr-2 h-4 w-4" /> Add Wallet
        </Button>
      </div>

      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle>Add Payment Wallet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Wallet Address</label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0x..."
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Seed Phrase</label>
              <textarea
                value={seedPhrase}
                onChange={(e) => setSeedPhrase(e.target.value)}
                placeholder="Enter 12/24 word seed phrase"
                className="w-full p-2 border rounded-lg"
                rows={3}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Payment Link</label>
              <textarea
                value={paymentLink}
                onChange={(e) => setPaymentLink(e.target.value)}
                placeholder="Ramp payment link"
                className="w-full p-2 border rounded-lg"
                rows={2}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddWallet} disabled={isAdding}>
                {isAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Wallet
              </Button>
              <Button variant="outline" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showEditForm && (
        <Card>
          <CardHeader>
            <CardTitle>Edit Payment Wallet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Wallet Address</label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0x..."
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Seed Phrase</label>
              <textarea
                value={seedPhrase}
                onChange={(e) => setSeedPhrase(e.target.value)}
                placeholder="Enter 12/24 word seed phrase"
                className="w-full p-2 border rounded-lg"
                rows={3}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Payment Link</label>
              <textarea
                value={paymentLink}
                onChange={(e) => setPaymentLink(e.target.value)}
                placeholder="Ramp payment link"
                className="w-full p-2 border rounded-lg"
                rows={2}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleUpdateWallet} disabled={isEditing}>
                {isEditing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Update Wallet
              </Button>
              <Button variant="outline" onClick={() => {
                setShowEditForm(false);
                setEditingWalletId(null);
                setAddress("");
                setSeedPhrase("");
                setPaymentLink("");
              }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Active Wallets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(wallets as any[]).map((wallet) => (
              <div key={wallet.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex-1">
                  <p className="font-mono text-sm">{wallet.address}</p>
                  <div className="text-xs text-muted-foreground mt-1">
                    <span className={`px-2 py-1 rounded ${wallet.status === "idle" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {wallet.status === "idle" ? "🟢 Available" : `🟠 In Use (${wallet.assignedUserName})`}
                    </span>
                    <span className="ml-2 text-blue-600 font-semibold">Live Balance: {walletBalances[wallet.id]?.toFixed(2) || "0.00"} USDT</span>
                    <span className="ml-2">Processed: {wallet.totalProcessed?.toFixed(2)} USDT</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(wallet.address);
                      toast({ title: "Copied", description: "Address copied to clipboard" });
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  {wallet.status === "in_use" && (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="text-orange-500"
                      onClick={() => handleClearTimer(wallet.id)}
                      title="Clear timer and release wallet"
                    >
                      ⏱️
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    variant="ghost"
                    className="text-blue-500"
                    onClick={() => handleEditWallet(wallet)}
                    title="Edit wallet"
                  >
                    ✏️
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="text-red-500"
                    onClick={() => handleDeleteWallet(wallet.id)}
                    title="Delete wallet"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
