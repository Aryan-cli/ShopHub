import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ChevronLeft, Upload, X, Loader2, Package, Plus, DollarSign, Percent } from "lucide-react";
import type { Product } from "@shared/schema";

const productFormSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  price: z.string().min(1, "Price is required").refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    "Price must be a positive number"
  ),
});

type ProductForm = z.infer<typeof productFormSchema>;

interface FeeSettings {
  globalFeePercent: number;
}

export default function AdminProductForm() {
  const [, params] = useRoute("/admin/products/:id/edit");
  const productId = params?.id;
  const isEditing = !!productId;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<string[]>([]);

  const { data: product, isLoading: isLoadingProduct } = useQuery<Product>({
    queryKey: ["/api/admin/products", productId],
    enabled: isEditing,
  });

  const { data: feeSettings } = useQuery<FeeSettings>({
    queryKey: ["/api/fee-settings"],
  });

  const form = useForm<ProductForm>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: "",
      description: "",
      price: "",
    },
    values: product ? {
      name: product.name,
      description: product.description,
      price: String(product.price),
    } : undefined,
  });

  const priceValue = form.watch("price");

  useEffect(() => {
    if (product) {
      const productImages: string[] = [];
      if (product.imageData) {
        productImages.push(product.imageData);
      }
      if (product.images && product.images.length > 0) {
        productImages.push(...product.images.filter(img => img !== product.imageData));
      }
      if (productImages.length > 0) {
        setImages(productImages);
      }
    }
  }, [product]);

  const createMutation = useMutation({
    mutationFn: async (data: ProductForm) => {
      const response = await apiRequest("POST", "/api/admin/products", {
        name: data.name,
        description: data.description,
        price: data.price,
        imageData: images[0] || null,
        imageType: images[0] ? "base64" : null,
        images: images.length > 0 ? images : null,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Product created",
        description: "Your product has been added to the store",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setLocation("/admin/products");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create product",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ProductForm) => {
      const response = await apiRequest("PATCH", `/api/admin/products/${productId}`, {
        name: data.name,
        description: data.description,
        price: data.price,
        imageData: images[0] || null,
        imageType: images[0] ? "base64" : null,
        images: images.length > 0 ? images : null,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Product updated",
        description: "Your changes have been saved",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setLocation("/admin/products");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update product",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProductForm) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(file => {
        if (file.size > 5 * 1024 * 1024) {
          toast({
            title: "File too large",
            description: "Please select images smaller than 5MB each",
            variant: "destructive",
          });
          return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          setImages(prev => [...prev, base64]);
        };
        reader.readAsDataURL(file);
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const price = parseFloat(priceValue) || 0;
  const feePercent = feeSettings?.globalFeePercent || 0;
  const feeAmount = (price * feePercent) / 100;
  const merchantReceives = price - feeAmount;

  if (isEditing && isLoadingProduct) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-64" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/products">
          <Button variant="ghost" className="mb-4" data-testid="button-back-products">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Products
          </Button>
        </Link>
        <h1 className="text-3xl font-bold" data-testid="text-product-form-title">
          {isEditing ? "Edit Product" : "Add New Product"}
        </h1>
        <p className="text-muted-foreground">
          {isEditing ? "Update your product details" : "Fill in the details to add a new product"}
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Product Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-4">
                <FormLabel>Product Images</FormLabel>
                <div className="flex flex-wrap items-start gap-3">
                  {images.map((img, index) => (
                    <div key={index} className="relative group">
                      <div className="h-24 w-24 rounded-lg bg-black overflow-hidden">
                        <img
                          src={img}
                          alt={`Product image ${index + 1}`}
                          className="h-full w-full object-contain"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6"
                        onClick={() => removeImage(index)}
                        data-testid={`button-remove-image-${index}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <div
                    className="h-24 w-24 rounded-lg bg-muted flex items-center justify-center cursor-pointer border-2 border-dashed border-muted-foreground/25 hover-elevate"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-upload-image"
                  >
                    <div className="text-center">
                      <Plus className="h-6 w-6 mx-auto text-muted-foreground/50" />
                      <span className="text-xs text-muted-foreground">Add</span>
                    </div>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageChange}
                  data-testid="input-image"
                />
                <p className="text-xs text-muted-foreground">
                  JPG, PNG or GIF. Max 5MB each. Upload multiple images.
                </p>
              </div>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter product name"
                        data-testid="input-product-name"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe your product..."
                        className="min-h-[120px] resize-none"
                        data-testid="input-product-description"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        data-testid="input-product-price"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {price > 0 && (
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Fee Breakdown
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Product Price:</span>
                        <span className="font-medium" data-testid="text-product-price-preview">${price.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Percent className="h-3 w-3" />
                          Platform Fee ({feePercent}%):
                        </span>
                        <span className="font-medium text-destructive" data-testid="text-fee-amount">-${feeAmount.toFixed(2)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between text-base">
                        <span className="font-semibold">You Receive:</span>
                        <span className="font-bold text-green-600 dark:text-green-400" data-testid="text-merchant-receives">${merchantReceives.toFixed(2)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex items-center gap-4 pt-4">
                <Button
                  type="submit"
                  disabled={isPending}
                  data-testid="button-submit-product"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isEditing ? "Saving..." : "Creating..."}
                    </>
                  ) : (
                    isEditing ? "Save Changes" : "Create Product"
                  )}
                </Button>
                <Link href="/admin/products">
                  <Button type="button" variant="outline" data-testid="button-cancel">
                    Cancel
                  </Button>
                </Link>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
