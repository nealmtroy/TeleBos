"use client";

import { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";
import { useTelegramServices, usePlaceOrder, usePlaceMassOrder, SMMService } from "@/hooks/use-orders";
import { useToast } from "@/components/ui/toast";
import {
  ShoppingCart,
  Plus,
  Minus,
  Search,
  AlertCircle,
  Loader2,
  Trash2,
  ListOrdered,
  FileText,
  Wallet,
  ChevronDown,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tab = "services" | "mass";

interface SmmOrderManagerProps {
  title: string;
  description: string;
  allowedServiceIds: number[];
}

export function SmmOrderManager({ title, description, allowedServiceIds }: SmmOrderManagerProps) {
  const _ = useT();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>("services");
  const { data: services, isLoading, error } = useTelegramServices();

  const [selectedService, setSelectedService] = useState<SMMService | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredServices = useMemo(() => {
    return services?.filter((s) => allowedServiceIds.includes(Number(s.id))) ?? [];
  }, [services, allowedServiceIds]);

  const tabs = [
    { id: "services" as Tab, label: _("orders.services") || "Services", icon: ListOrdered },
    { id: "mass" as Tab, label: _("orders.massOrder") || "Mass Order", icon: FileText },
  ];

  const handleOrderSelect = (service: SMMService) => {
    setSelectedService(service);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header + Balance */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-250 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-gray-550 mt-1 text-sm">{description}</p>
        </div>
        {user && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-xl self-start sm:self-auto shadow-sm">
            <Wallet className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-800 whitespace-nowrap">
              {_("orders.yourBalance")}: <span className="text-sm font-bold text-emerald-700 ml-1">Rp {user.balance?.toLocaleString() || 0}</span>
            </span>
          </div>
        )}
      </div>

      {/* Tab Navigation (Underline style) */}
      <div className="border-b border-gray-200 w-full">
        <div className="flex gap-6 -mb-px overflow-x-auto no-scrollbar">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 pb-3.5 px-1 text-sm font-semibold transition-all border-b-2 whitespace-nowrap focus:outline-none",
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Views */}
      <div className="mt-4">
        {tab === "services" && (
          <ServicesListView
            services={filteredServices}
            isLoading={isLoading}
            error={error}
            onOrderSelect={handleOrderSelect}
          />
        )}
        {tab === "mass" && (
          <MassOrderForm
            services={filteredServices}
          />
        )}
      </div>

      {/* Order Modal Portal */}
      {isModalOpen && selectedService && (
        <OrderModal
          service={selectedService}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedService(null);
          }}
        />
      )}
    </div>
  );
}

interface ServicesListViewProps {
  services: SMMService[];
  isLoading: boolean;
  error: any;
  onOrderSelect: (service: SMMService) => void;
}

function ServicesListView({ services, isLoading, error, onOrderSelect }: ServicesListViewProps) {
  const _ = useT();
  const [search, setSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const { grouped, categories } = useMemo(() => {
    const filtered = services.filter(
      (s) =>
        !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.category.toLowerCase().includes(search.toLowerCase())
    );

    const map = new Map<string, SMMService[]>();
    for (const s of filtered) {
      const cat = s.category || "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }

    const sortedCategories = Array.from(map.keys()).sort();
    return { grouped: map, categories: sortedCategories };
  }, [services, search]);

  useEffect(() => {
    if (categories.length > 0) {
      const defaultExpanded: Record<string, boolean> = {};
      for (const cat of categories) {
        defaultExpanded[cat] = true;
      }
      setExpandedCategories(defaultExpanded);
    }
  }, [categories]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const totalInCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of services) {
      m.set(s.category, (m.get(s.category) || 0) + 1);
    }
    return m;
  }, [services]);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {Array.from({ length: 2 }).map((_, gi) => (
          <div key={gi} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-white">
            <div className="h-5 w-40 bg-gray-100 rounded" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-55 rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-red-800">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        <p className="text-sm font-medium">Failed to load services</p>
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="text-center py-16 border border-gray-200 bg-white rounded-2xl">
        <Search className="h-10 w-10 mx-auto mb-3 text-gray-300" />
        <p className="font-semibold text-gray-900 text-sm">No services available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative w-full sm:max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={_("orders.searchService") || "Search services..."}
          className="w-full pl-9 pr-4 py-2 border border-gray-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900 placeholder:text-gray-400"
        />
      </div>

      <div className="space-y-5">
        {categories.map((cat) => {
          const items = grouped.get(cat) ?? [];
          const isExpanded = expandedCategories[cat] ?? true;
          const totalCount = totalInCategory.get(cat) || 0;

          return (
            <div key={cat} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(cat)}
                className="w-full flex items-center justify-between px-5 py-4 bg-gray-50/75 border-b border-gray-150 text-left transition hover:bg-gray-100/50"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-900">{cat}</span>
                  <Badge variant="outline" className="text-xs bg-gray-100 text-gray-600 border-gray-200 font-semibold px-2 py-0.5">
                    {items.length}/{totalCount} {_("orders.services")}
                  </Badge>
                </div>
                <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform", !isExpanded && "rotate-180")} />
              </button>

              {isExpanded && (
                <div className="divide-y divide-gray-150">
                  {items.map((service) => (
                    <div key={service.id} className="p-5 flex flex-col md:flex-row md:items-start justify-between gap-5 border-b last:border-b-0 border-gray-100 hover:bg-gray-50/30 transition">
                      <div className="space-y-3 flex-1 min-w-0">
                        {/* Title and ID */}
                        <div className="flex items-start gap-2">
                          <Badge variant="outline" className="text-[10px] font-mono font-bold bg-gray-50 text-gray-500 border-gray-200 px-1.5 py-0.5 shrink-0 mt-0.5">
                            ID: {service.id}
                          </Badge>
                          <h4 className="text-sm font-bold text-gray-900 leading-snug">
                            {service.name}
                          </h4>
                        </div>

                        {/* Separate Visual Panels for Speed & Min/Max */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {/* Min Order */}
                          <div className="bg-gray-50 border border-gray-100 p-2.5 rounded-xl text-center">
                            <span className="text-[10px] text-gray-450 font-bold block uppercase tracking-wider mb-0.5">Min Order</span>
                            <span className="text-xs font-bold text-gray-800">{service.min.toLocaleString()}</span>
                          </div>

                          {/* Max Order */}
                          <div className="bg-gray-50 border border-gray-100 p-2.5 rounded-xl text-center">
                            <span className="text-[10px] text-gray-450 font-bold block uppercase tracking-wider mb-0.5">Max Order</span>
                            <span className="text-xs font-bold text-gray-800">{service.max.toLocaleString()}</span>
                          </div>

                          {/* Speed */}
                          {service.speed && (
                            <div className="bg-blue-50/40 border border-blue-100/50 p-2.5 rounded-xl text-center flex items-center justify-center gap-1">
                              <Zap className="h-3 w-3 text-blue-500 shrink-0" />
                              <div className="text-left sm:text-center min-w-0">
                                <span className="text-[10px] text-blue-600 font-bold block uppercase tracking-wider mb-0.5">Speed</span>
                                <span className="text-xs font-bold text-blue-800 truncate block" title={service.speed}>{service.speed}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Note Description Box */}
                        {service.note && (
                          <div className="text-xs text-gray-550 bg-gray-50 border border-gray-100 p-3 rounded-xl leading-relaxed whitespace-pre-wrap">
                            {service.note}
                          </div>
                        )}
                      </div>

                      {/* Pricing and Action */}
                      <div className="flex md:flex-col items-center md:items-end justify-between md:justify-start gap-4 md:gap-2 pt-4 md:pt-0 border-t md:border-t-0 border-gray-150 shrink-0">
                        <div className="md:text-right">
                          <span className="text-[10px] text-gray-450 font-bold block uppercase tracking-wider">{_("orders.price") || "Price"}</span>
                          <span className="text-base font-extrabold text-primary-600">
                            Rp {service.price.toLocaleString()}
                            <span className="text-xs text-gray-400 font-normal">/1k</span>
                          </span>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => onOrderSelect(service)}
                          className="bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold h-9 px-4 shadow-sm"
                        >
                          <ShoppingCart className="h-3.5 w-3.5 mr-1.5" /> {_("orders.placeOrder")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface OrderModalProps {
  service: SMMService;
  onClose: () => void;
}

function OrderModal({ service, onClose }: OrderModalProps) {
  const _ = useT();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const placeOrder = usePlaceOrder();

  const [dataTarget, setDataTarget] = useState("");
  const [quantity, setQuantity] = useState(service.min);
  const [comments, setComments] = useState("");

  const estimatedPrice = Math.max(1, (service.price * quantity) / 1000);
  const hasSufficientBalance = user ? user.balance >= estimatedPrice : false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dataTarget) return;

    try {
      await placeOrder.mutateAsync({
        service_id: Number(service.id),
        data_target: dataTarget,
        quantity,
        comments: comments || undefined,
      });
      toast({
        variant: "success",
        title: _("orders.orderPlaced") || "Order placed successfully!",
      });
      onClose();
    } catch (err: any) {
      toast({
        variant: "error",
        title: _("orders.orderFailed") || "Order failed",
        description: err?.response?.data?.detail || "An error occurred",
      });
    }
  };

  // Prevent scroll background
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" />

      {/* Dialog Body */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl border border-gray-250 w-full max-w-xl p-6 md:p-8 z-10 overflow-y-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: "scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-150 pb-4 mb-5">
          <div className="pr-6">
            <h3 className="text-lg font-bold text-gray-900">{_("orders.newOrder") || "New Order"}</h3>
            <p className="text-xs text-gray-550 mt-1">Order service via SMM panel</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-650 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Selected Service Info */}
        <div className="p-4 bg-gray-50 border border-gray-150 rounded-xl text-xs space-y-3 mb-5">
          <div>
            <span className="text-[10px] font-mono font-bold bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded border border-gray-300">
              ID: {service.id}
            </span>
            <p className="font-bold text-gray-950 mt-1.5 leading-snug">{service.name}</p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center border-t border-gray-200/80 pt-3">
            <div>
              <span className="text-[9px] text-gray-450 font-bold block uppercase tracking-wider">Min</span>
              <span className="text-xs font-bold text-gray-800">{service.min.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-[9px] text-gray-450 font-bold block uppercase tracking-wider">Max</span>
              <span className="text-xs font-bold text-gray-800">{service.max.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-[9px] text-gray-450 font-bold block uppercase tracking-wider">Speed</span>
              <span className="text-xs font-bold text-blue-700 truncate block" title={service.speed}>{service.speed || "Instant"}</span>
            </div>
          </div>

          {service.note && (
            <p className="text-gray-500 leading-relaxed border-t border-gray-200/80 pt-2.5 italic">
              {service.note}
            </p>
          )}
        </div>

        {/* Order Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">{_("orders.dataTarget")}</label>
            <input
              type="text"
              value={dataTarget}
              onChange={(e) => setDataTarget(e.target.value)}
              placeholder={_("orders.dataTargetPlaceholder") || "Enter target URL or username..."}
              className="w-full border border-gray-200 bg-white rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-950 placeholder:text-gray-400"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">{_("orders.quantity")}</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(service.min, quantity - 100))}
                className="p-3 border border-gray-200 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors flex-shrink-0"
              >
                <Minus className="h-4 w-4 text-gray-500" />
              </button>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                min={service.min}
                max={service.max}
                className="w-full text-center border border-gray-200 bg-white rounded-xl px-3 py-2.5 text-sm font-bold text-gray-950 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setQuantity(Math.min(service.max, quantity + 100))}
                className="p-3 border border-gray-200 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors flex-shrink-0"
              >
                <Plus className="h-4 w-4 text-gray-500" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Comments <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
              placeholder="One comment per line for comment services..."
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white text-gray-900 placeholder:text-gray-400"
            />
          </div>

          {/* Order Summary */}
          <div className="p-4 bg-gray-50 border border-gray-150 rounded-xl space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Order Summary</h4>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">{_("orders.price")}:</span>
              <span className="font-semibold text-gray-800">Rp {service.price.toLocaleString()}/1k</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">{_("orders.quantity")}:</span>
              <span className="font-semibold text-gray-800">{quantity.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t border-gray-200 pt-2.5">
              <span className="text-gray-900">{_("orders.totalPrice")}:</span>
              <span className="text-primary-600">Rp {estimatedPrice.toLocaleString()}</span>
            </div>
          </div>

          {/* Balance Alert Banner */}
          {user && (
            <div className={cn(
              "p-3 rounded-xl border text-xs font-semibold flex items-center gap-2",
              hasSufficientBalance
                ? "bg-emerald-50 border-emerald-100 text-emerald-800"
                : "bg-red-50 border-red-100 text-red-800"
            )}>
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <div>
                {hasSufficientBalance ? (
                  <span>Balance sufficient. Rp {(user.balance - estimatedPrice).toLocaleString()} will remain.</span>
                ) : (
                  <span>Insufficient balance. Required: Rp {estimatedPrice.toLocaleString()} (Your balance: Rp {user.balance.toLocaleString()}).</span>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={placeOrder.isPending}
              className="flex-1 rounded-xl border-gray-200 h-11 text-sm font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={placeOrder.isPending || !dataTarget || !hasSufficientBalance}
              className="flex-1 h-11 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold shadow-sm transition-colors border-0"
            >
              {placeOrder.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {_("orders.placingOrder")}</>
              ) : (
                <><ShoppingCart className="h-4 w-4 mr-2" /> {_("orders.placeOrder")}</>
              )}
            </Button>
          </div>
        </form>
      </div>

      <style jsx global>{`
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>,
    document.body
  );
}

interface MassOrderFormProps {
  services: SMMService[];
}

function MassOrderForm({ services }: MassOrderFormProps) {
  const _ = useT();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const placeMassOrder = usePlaceMassOrder();

  const [items, setItems] = useState<Array<{ service_id: number | ""; data_target: string; quantity: number }>>([
    { service_id: "", data_target: "", quantity: 100 },
  ]);

  const addItem = () => {
    setItems([...items, { service_id: "", data_target: "", quantity: 100 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...items];
    (updated[index] as any)[field] = value;
    setItems(updated);
  };

  const totalCost = items.reduce((sum, item) => {
    const svc = services.find((s) => Number(s.id) === Number(item.service_id));
    if (!svc || !item.service_id) return sum;
    return sum + Math.max(1, (svc.price * item.quantity) / 1000);
  }, 0);

  const hasSufficientBalance = user ? user.balance >= totalCost : false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = items.filter((i) => i.service_id && i.data_target);
    if (validItems.length === 0) return;

    try {
      await placeMassOrder.mutateAsync(
        validItems.map((i) => ({
          service_id: Number(i.service_id),
          data_target: i.data_target,
          quantity: i.quantity,
        }))
      );
      toast({
        variant: "success",
        title: _("orders.orderPlaced") || "Orders placed successfully!",
        description: `Successfully placed ${validItems.length} orders.`,
      });
      setItems([{ service_id: "", data_target: "", quantity: 100 }]);
    } catch (err: any) {
      toast({
        variant: "error",
        title: _("orders.orderFailed") || "Orders failed",
        description: err?.response?.data?.detail || "An error occurred",
      });
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <Card className="border border-gray-200 bg-white shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="border-b border-gray-100 py-4 px-6 bg-gray-50/50">
          <CardTitle className="text-base sm:text-lg font-bold text-gray-900">{_("orders.massOrder") || "Mass Order"}</CardTitle>
          <CardDescription className="text-xs text-gray-500 mt-0.5">{_("orders.massOrderDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className="p-4 border border-gray-150 rounded-xl space-y-3 relative bg-gray-50/30">
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors z-10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      {_("orders.services")} #{index + 1}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-gray-700 mb-1">{_("orders.services")}</label>
                      <select
                        value={item.service_id}
                        onChange={(e) => updateItem(index, "service_id", e.target.value ? Number(e.target.value) : "")}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white text-gray-900"
                        required
                      >
                        <option value="">{_("orders.selectService")}</option>
                        {services.map((s) => (
                          <option key={s.id} value={s.id}>
                            [{s.id}] {s.name} - Rp {s.price.toLocaleString()}/1k
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">{_("orders.quantity")}</label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white text-gray-900"
                        required
                        min={1}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">{_("orders.dataTarget")}</label>
                    <input
                      type="text"
                      value={item.data_target}
                      onChange={(e) => updateItem(index, "data_target", e.target.value)}
                      placeholder={_("orders.dataTargetPlaceholder") || "Enter target URL or username..."}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white text-gray-900 placeholder:text-gray-400"
                      required
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-primary hover:bg-gray-50 rounded-xl transition-all w-full justify-center border border-dashed border-gray-200 hover:border-gray-300"
            >
              <Plus className="h-4 w-4" /> {_("orders.addMore")}
            </button>

            <div className="p-4 bg-gray-50 border border-gray-150 rounded-xl space-y-2">
              <div className="flex justify-between text-sm font-bold">
                <span className="text-gray-950">{_("orders.totalAll")}:</span>
                <span className="text-primary text-primary-600">Rp {totalCost.toLocaleString()}</span>
              </div>
            </div>

            {/* Balance Alert Banner */}
            {user && (
              <div className={cn(
                "p-3 rounded-xl border text-xs font-semibold flex items-center gap-2",
                hasSufficientBalance
                  ? "bg-emerald-50 border-emerald-100 text-emerald-800"
                  : "bg-red-50 border-red-100 text-red-800"
              )}>
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <div>
                  {hasSufficientBalance ? (
                    <span>Balance sufficient. Rp {(user.balance - totalCost).toLocaleString()} will remain.</span>
                  ) : (
                    <span>Insufficient balance. Required: Rp {totalCost.toLocaleString()} (Your balance: Rp {user.balance.toLocaleString()}).</span>
                  )}
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={placeMassOrder.isPending || items.every((i) => !i.service_id || !i.data_target) || !hasSufficientBalance}
              className="w-full h-11 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold shadow-sm border-0 transition-colors"
            >
              {placeMassOrder.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {_("orders.placingOrder")}</>
              ) : (
                <><ShoppingCart className="h-4 w-4 mr-2" /> {_("orders.placeOrder")} ({items.filter((i) => i.service_id && i.data_target).length})</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
