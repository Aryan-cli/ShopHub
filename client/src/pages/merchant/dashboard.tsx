import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Package, Edit, Trash2, Loader2, Eye, ImagePlus, X, Percent, DollarSign, Archive, Hash } from "lucide-react";
import type { Product } from "@shared/schema";

interface FeeSettings {
  globalFeePercent: number;
}

export default function MerchantDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    imageData: "",
    imageType: "",
    images: [] as string[],
    afterBuyMessage: "Thank you for your purchase!",
    afterBuyButtonLabel: "",
    afterBuyButtonUrl: "",
    stockQuantity: "" as string,
  });

  const { data: feeSettings } = useQuery<FeeSettings>({
    queryKey: ["/api/fee-settings"],
    enabled: !!user?.isMerchant,
  });

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/merchant/products"],
    enabled: !!user?.isMerchant,
  });

  const createProductMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/merchant/products", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Product added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add product", description: error.message, variant: "destructive" });
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const response = await apiRequest("PATCH", `/api/merchant/products/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Product updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setEditingProduct(null);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update product", description: error.message, variant: "destructive" });
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/merchant/products/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Product deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: () => {
      toast({ title: "Failed to delete product", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({ 
      name: "", 
      description: "", 
      price: "", 
      imageData: "", 
      imageType: "",
      images: [],
      afterBuyMessage: "Thank you for your purchase!",
      afterBuyButtonLabel: "",
      afterBuyButtonUrl: "",
      stockQuantity: "",
    });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({
          ...prev,
          imageData: reader.result as string,
          imageType: file.type,
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAdditionalImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newImages: string[] = [];
      let processed = 0;
      
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          newImages.push(reader.result as string);
          processed++;
          if (processed === files.length) {
            setFormData((prev) => ({
              ...prev,
              images: [...prev.images, ...newImages].slice(0, 5),
            }));
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeGalleryImage = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

  const feePercent = feeSettings?.globalFeePercent || 0;
  const priceNum = parseFloat(formData.price) || 0;
  const feeAmount = priceNum * (feePercent / 100);
  const merchantEarnings = priceNum - feeAmount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = {
      ...formData,
      stockQuantity: formData.stockQuantity !== "" ? parseInt(formData.stockQuantity, 10) : null,
    };
    if (editingProduct) {
      updateProductMutation.mutate({ id: editingProduct.id, data: submitData as any });
    } else {
      createProductMutation.mutate(submitData as any);
    }
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description,
      price: product.price,
      imageData: product.imageData || "",
      imageType: product.imageType || "",
      images: product.images || [],
      afterBuyMessage: product.afterBuyMessage || "Thank you for your purchase!",
      afterBuyButtonLabel: product.afterBuyButtonLabel || "",
      afterBuyButtonUrl: product.afterBuyButtonUrl || "",
      stockQuantity: product.stockQuantity !== null && product.stockQuantity !== undefined ? String(product.stockQuantity) : "",
    });
  };

  if (!user?.isMerchant) {
    setLocation("/profile");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container px-4 md:px-8 py-8">
        <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">Merchant Dashboard</h1>
            <p className="text-muted-foreground">Manage your products</p>
          </div>
          
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-product">
                <Plus className="mr-2 h-4 w-4" />
                Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Product</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Product Name</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter product name"
                    required
                    data-testid="input-product-name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Enter product description"
                    required
                    className="resize-none"
                    data-testid="input-product-description"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Price</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData((prev) => ({ ...prev, price: e.target.value }))}
                    placeholder="0.00"
                    required
                    data-testid="input-product-price"
                  />
                  {priceNum > 0 && feePercent > 0 && (
                    <div className="p-3 rounded-md bg-muted/50 space-y-2 mt-2">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Percent className="h-3.5 w-3.5" />
                          Platform Fee ({feePercent}%)
                        </span>
                        <span className="text-destructive">-${feeAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-sm font-medium">
                        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <DollarSign className="h-3.5 w-3.5" />
                          You Receive
                        </span>
                        <span className="text-green-600 dark:text-green-400" data-testid="text-merchant-earnings">
                          ${merchantEarnings.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Stock Quantity (Optional)</label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={formData.stockQuantity}
                    onChange={(e) => setFormData((prev) => ({ ...prev, stockQuantity: e.target.value }))}
                    placeholder="Leave empty for unlimited stock"
                    data-testid="input-product-stock"
                  />
                  <p className="text-xs text-muted-foreground">Set a stock limit. Leave empty for unlimited. Product will show as "Out of Stock" when quantity reaches 0.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Main Image (Thumbnail)</label>
                  <div className="flex items-center gap-4">
                    {formData.imageData ? (
                      <img src={formData.imageData} alt="Preview" className="h-20 w-20 object-contain bg-black rounded-md" />
                    ) : (
                      <div className="h-20 w-20 bg-muted rounded-md flex items-center justify-center">
                        <ImagePlus className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      data-testid="input-product-image"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Gallery Images (up to 5)</label>
                  <div className="flex flex-wrap gap-2">
                    {formData.images.map((img, index) => (
                      <div key={index} className="relative h-16 w-16">
                        <img src={img} alt={`Gallery ${index + 1}`} className="h-full w-full object-contain bg-black rounded-md" />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-5 w-5"
                          onClick={() => removeGalleryImage(index)}
                          data-testid={`button-remove-gallery-${index}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    {formData.images.length < 5 && (
                      <label className="h-16 w-16 bg-muted rounded-md flex items-center justify-center cursor-pointer hover:bg-muted/80">
                        <ImagePlus className="h-6 w-6 text-muted-foreground" />
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={handleAdditionalImages}
                          data-testid="input-gallery-images"
                        />
                      </label>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Add additional images to showcase your product</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">After Purchase Message</label>
                  <Textarea
                    value={formData.afterBuyMessage}
                    onChange={(e) => setFormData((prev) => ({ ...prev, afterBuyMessage: e.target.value }))}
                    placeholder="Message shown to buyer after purchase confirmation"
                    required
                    className="resize-none"
                    data-testid="input-after-buy-message"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">After Purchase Button Label (Optional)</label>
                  <Input
                    value={formData.afterBuyButtonLabel}
                    onChange={(e) => setFormData((prev) => ({ ...prev, afterBuyButtonLabel: e.target.value }))}
                    placeholder="e.g. Download Now, Access Product"
                    data-testid="input-after-buy-button-label"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">After Purchase Button URL (Optional)</label>
                  <Input
                    value={formData.afterBuyButtonUrl}
                    onChange={(e) => setFormData((prev) => ({ ...prev, afterBuyButtonUrl: e.target.value }))}
                    placeholder="https://..."
                    data-testid="input-after-buy-button-url"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={createProductMutation.isPending} data-testid="button-submit-product">
                  {createProductMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    "Add Product"
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        ) : products && products.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => (
              <Card key={product.id} data-testid={`card-product-${product.id}`}>
                <div className="aspect-video overflow-hidden rounded-t-lg bg-black">
                  {product.imageData ? (
                    <img src={product.imageData} alt={product.name} className="h-full w-full object-contain" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-muted">
                      <Package className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-1">{product.name}</h3>
                  <p className="text-lg font-bold text-primary mb-2">${Number(product.price).toFixed(2)}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <Eye className="h-4 w-4" />
                    <span>{product.viewCount || 0} views</span>
                  </div>
                  <div className="flex items-center gap-2 mb-4">
                    {product.stockQuantity === null || product.stockQuantity === undefined ? (
                      <Badge variant="outline" className="text-xs" data-testid={`badge-stock-${product.id}`}>
                        <Hash className="h-3 w-3 mr-1" />
                        Unlimited Stock
                      </Badge>
                    ) : product.stockQuantity <= 0 ? (
                      <Badge variant="destructive" className="text-xs" data-testid={`badge-stock-${product.id}`}>
                        Out of Stock
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs" data-testid={`badge-stock-${product.id}`}>
                        <Hash className="h-3 w-3 mr-1" />
                        {product.stockQuantity} in stock
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(product)} data-testid={`button-edit-${product.id}`}>
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteProductMutation.mutate(product.id)}
                      disabled={deleteProductMutation.isPending}
                      data-testid={`button-delete-${product.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-16 text-center">
              <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">No products yet</h2>
              <p className="text-muted-foreground mb-4">Start by adding your first product</p>
              <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-first-product">
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Product
              </Button>
            </CardContent>
          </Card>
        )}

        <Dialog open={!!editingProduct} onOpenChange={(open) => !open && setEditingProduct(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Product</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Product Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter product name"
                  required
                  data-testid="input-edit-product-name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter product description"
                  required
                  className="resize-none"
                  data-testid="input-edit-product-description"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Price</label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData((prev) => ({ ...prev, price: e.target.value }))}
                  placeholder="0.00"
                  required
                  data-testid="input-edit-product-price"
                />
                {priceNum > 0 && feePercent > 0 && (
                  <div className="p-3 rounded-md bg-muted/50 space-y-2 mt-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Percent className="h-3.5 w-3.5" />
                        Platform Fee ({feePercent}%)
                      </span>
                      <span className="text-destructive">-${feeAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm font-medium">
                      <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <DollarSign className="h-3.5 w-3.5" />
                        You Receive
                      </span>
                      <span className="text-green-600 dark:text-green-400" data-testid="text-edit-merchant-earnings">
                        ${merchantEarnings.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Stock Quantity (Optional)</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.stockQuantity}
                  onChange={(e) => setFormData((prev) => ({ ...prev, stockQuantity: e.target.value }))}
                  placeholder="Leave empty for unlimited stock"
                  data-testid="input-edit-product-stock"
                />
                <p className="text-xs text-muted-foreground">Set a stock limit. Leave empty for unlimited. Product will show as "Out of Stock" when quantity reaches 0.</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Main Image (Thumbnail)</label>
                <div className="flex items-center gap-4">
                  {formData.imageData ? (
                    <img src={formData.imageData} alt="Preview" className="h-20 w-20 object-contain bg-black rounded-md" />
                  ) : (
                    <div className="h-20 w-20 bg-muted rounded-md flex items-center justify-center">
                      <ImagePlus className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    data-testid="input-edit-product-image"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Gallery Images (up to 5)</label>
                <div className="flex flex-wrap gap-2">
                  {formData.images.map((img, index) => (
                    <div key={index} className="relative h-16 w-16">
                      <img src={img} alt={`Gallery ${index + 1}`} className="h-full w-full object-contain bg-black rounded-md" />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-5 w-5"
                        onClick={() => removeGalleryImage(index)}
                        data-testid={`button-edit-remove-gallery-${index}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  {formData.images.length < 5 && (
                    <label className="h-16 w-16 bg-muted rounded-md flex items-center justify-center cursor-pointer hover:bg-muted/80">
                      <ImagePlus className="h-6 w-6 text-muted-foreground" />
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleAdditionalImages}
                        data-testid="input-edit-gallery-images"
                      />
                    </label>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Add additional images to showcase your product</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">After Purchase Message</label>
                <Textarea
                  value={formData.afterBuyMessage}
                  onChange={(e) => setFormData((prev) => ({ ...prev, afterBuyMessage: e.target.value }))}
                  placeholder="Message shown to buyer after purchase confirmation"
                  required
                  className="resize-none"
                  data-testid="input-edit-after-buy-message"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">After Purchase Button Label (Optional)</label>
                <Input
                  value={formData.afterBuyButtonLabel}
                  onChange={(e) => setFormData((prev) => ({ ...prev, afterBuyButtonLabel: e.target.value }))}
                  placeholder="e.g. Download Now, Access Product"
                  data-testid="input-edit-after-buy-button-label"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">After Purchase Button URL (Optional)</label>
                <Input
                  value={formData.afterBuyButtonUrl}
                  onChange={(e) => setFormData((prev) => ({ ...prev, afterBuyButtonUrl: e.target.value }))}
                  placeholder="https://..."
                  data-testid="input-edit-after-buy-button-url"
                />
              </div>
              <Button type="submit" className="w-full" disabled={updateProductMutation.isPending} data-testid="button-update-product">
                {updateProductMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Product"
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
