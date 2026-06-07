import { useState, useRef, useEffect } from "react";
import { useWallet, useDeposit, useWithdraw, useCardDeposit, useVerifyOtp, useResendOtp, useDepositMethods, type DepositMethod } from "@/hooks/use-wallet";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, ArrowUpRight, ArrowDownLeft, Wallet as WalletIcon, Building2, CreditCard, Landmark, ShieldCheck, RotateCcw, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { NIGERIAN_BANKS } from "@/lib/nigerian-banks";

type DepositMethodType = "bank_transfer" | "card" | "bank_account";
type DepositStep = "method" | "details" | "otp" | "success";

export default function Wallet() {
  const { data: wallet, isLoading } = useWallet();
  const { data: depositMethodsData } = useDepositMethods();
  const { mutate: deposit, isPending: isDepositing } = useDeposit();
  const { mutate: withdraw, isPending: isWithdrawing } = useWithdraw();
  const { mutateAsync: initiateCardDeposit, isPending: isInitiating } = useCardDeposit();
  const { mutateAsync: verifyOtp, isPending: isVerifying } = useVerifyOtp();
  const { mutate: resendOtp, isPending: isResending } = useResendOtp();

  const [amount, setAmount] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit");
  const [open, setOpen] = useState(false);

  const [depositMethod, setDepositMethod] = useState<DepositMethodType>("bank_transfer");
  const [depositStep, setDepositStep] = useState<DepositStep>("method");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [otpSessionId, setOtpSessionId] = useState("");
  const [otpValue, setOtpValue] = useState(["", "", "", "", "", ""]);
  const [otpMaskedInfo, setOtpMaskedInfo] = useState("");
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [selectedWithdrawMethod, setSelectedWithdrawMethod] = useState<DepositMethod | null>(null);

  const selectedBank = NIGERIAN_BANKS.find(b => b.code === bankCode);

  const resetForm = () => {
    setAmount("");
    setBankCode("");
    setAccountNumber("");
    setAccountName("");
    setDepositMethod("bank_transfer");
    setDepositStep("method");
    setCardNumber("");
    setCardExpiry("");
    setCardCvv("");
    setOtpSessionId("");
    setOtpValue(["", "", "", "", "", ""]);
    setOtpMaskedInfo("");
    setSelectedWithdrawMethod(null);
  };

  const handleBankTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(amount);
    if (!val || !bankCode || !accountNumber) return;

    const bankInfo = {
      amount: val,
      bankCode,
      bankName: selectedBank?.name || "",
      accountNumber,
      accountName: accountName || undefined,
    };

    if (action === "deposit") {
      deposit(bankInfo, { onSuccess: () => { setOpen(false); resetForm(); }});
    } else {
      withdraw(bankInfo, { onSuccess: () => { setOpen(false); resetForm(); }});
    }
  };

  const handleCardDepositInitiate = async () => {
    const val = Number(amount);
    if (!val || val < 100) return;

    try {
      const result = await initiateCardDeposit({
        amount: val,
        paymentMethod: depositMethod === "card" ? "card" : "bank_account",
        ...(depositMethod === "card" ? {
          cardNumber: cardNumber.replace(/\s/g, ''),
          cardExpiry,
          cardCvv,
        } : {
          bankCode,
          accountNumber,
        }),
      });

      setOtpSessionId(result.sessionId);
      setOtpMaskedInfo(result.otpSentTo);
      setDepositStep("otp");
    } catch {}
  };

  const handleOtpVerify = async () => {
    const otp = otpValue.join("");
    if (otp.length !== 6 || !otpSessionId) return;

    try {
      await verifyOtp({ sessionId: otpSessionId, otp });
      setDepositStep("success");
      setTimeout(() => {
        setOpen(false);
        resetForm();
      }, 2000);
    } catch {}
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otpValue];
    newOtp[index] = value.slice(-1);
    setOtpValue(newOtp);

    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otpValue[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pastedData.length === 6) {
      setOtpValue(pastedData.split(""));
      otpInputRefs.current[5]?.focus();
    }
  };

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  };

  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) return digits.slice(0, 2) + '/' + digits.slice(2);
    return digits;
  };

  useEffect(() => {
    if (depositStep === "otp") {
      otpInputRefs.current[0]?.focus();
    }
  }, [depositStep]);

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const getMethodIcon = (method: DepositMethod) => {
    if (method.bankName === "Card Payment") return <CreditCard className="w-5 h-5 text-primary" />;
    return <Building2 className="w-5 h-5 text-primary" />;
  };

  const getMethodLabel = (method: DepositMethod) => {
    if (method.bankName === "Card Payment") return `Debit Card (${method.accountNumber})`;
    if (method.bankCode) {
      const bank = NIGERIAN_BANKS.find(b => b.code === method.bankCode);
      return `${bank?.name || method.bankName} — ${method.accountNumber}`;
    }
    return `${method.bankName} — ${method.accountNumber}`;
  };

  const handleWithdrawSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(amount);
    const methods = depositMethodsData?.methods ?? [];
    if (!val) return;

    if (methods.length > 0 && !selectedWithdrawMethod) return;

    const dest = methods.length > 0 && selectedWithdrawMethod ? {
      bankCode: selectedWithdrawMethod.bankCode ?? undefined,
      bankName: selectedWithdrawMethod.bankName ?? "",
      accountNumber: selectedWithdrawMethod.accountNumber ?? "",
      accountName: selectedWithdrawMethod.accountName ?? undefined,
    } : {
      bankCode: bankCode || undefined,
      bankName: NIGERIAN_BANKS.find(b => b.code === bankCode)?.name ?? bankCode,
      accountNumber,
      accountName: accountName || undefined,
    };

    withdraw({ amount: val, ...dest }, { onSuccess: () => { setOpen(false); resetForm(); } });
  };

  const renderDepositContent = () => {
    if (action === "withdraw") {
      const methods = depositMethodsData?.methods ?? [];
      const hasDeposits = depositMethodsData?.hasDeposits ?? false;

      return (
        <form onSubmit={handleWithdrawSubmit} className="space-y-4 mt-4">
          {hasDeposits ? (
            <>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  For security, withdrawals can only be sent back to the payment method you used to deposit funds.
                </p>
                <label className="text-sm font-medium">Select Refund Destination</label>
                <div className="space-y-2">
                  {methods.map((m, i) => {
                    const isSelected = selectedWithdrawMethod?.accountNumber === m.accountNumber && selectedWithdrawMethod?.bankName === m.bankName;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedWithdrawMethod(m)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                        data-testid={`button-withdraw-method-${i}`}
                      >
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          {getMethodIcon(m)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground text-sm truncate">{getMethodLabel(m)}</p>
                          {m.accountName && <p className="text-xs text-muted-foreground truncate">{m.accountName}</p>}
                        </div>
                        {isSelected && <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                You have no deposit history. Enter your bank details to receive your job earnings.
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Select Bank
                </label>
                <Select value={bankCode} onValueChange={setBankCode}>
                  <SelectTrigger className="rounded-xl" data-testid="select-bank">
                    <SelectValue placeholder="Choose your bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {NIGERIAN_BANKS.map((bank) => (
                      <SelectItem key={bank.code} value={bank.code} data-testid={`select-bank-option-${bank.code}`}>
                        {bank.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Account Number</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  placeholder="Enter 10-digit account number"
                  value={accountNumber}
                  onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                  className="rounded-xl"
                  data-testid="input-account-number"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Account Name (optional)</label>
                <Input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={accountName}
                  onChange={e => setAccountName(e.target.value)}
                  className="rounded-xl"
                  data-testid="input-account-name"
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Amount (N)</label>
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="rounded-xl text-lg"
              data-testid="input-amount"
            />
          </div>

          {selectedWithdrawMethod && amount && (
            <Card className="bg-muted/50 border-dashed">
              <CardContent className="p-4 space-y-1 text-sm">
                <p className="font-semibold text-foreground" data-testid="text-summary-title">Withdrawal Summary</p>
                <div className="flex justify-between gap-2 flex-wrap">
                  <span className="text-muted-foreground">To</span>
                  <span className="font-medium text-foreground" data-testid="text-summary-destination">{getMethodLabel(selectedWithdrawMethod)}</span>
                </div>
                {selectedWithdrawMethod.accountName && (
                  <div className="flex justify-between gap-2 flex-wrap">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium text-foreground">{selectedWithdrawMethod.accountName}</span>
                  </div>
                )}
                <div className="flex justify-between gap-2 flex-wrap">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-bold text-primary" data-testid="text-summary-amount">N{Number(amount).toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          )}

          <Button
            type="submit"
            className="w-full rounded-xl font-bold bg-primary text-white"
            disabled={isWithdrawing || !amount || (hasDeposits && !selectedWithdrawMethod) || (!hasDeposits && (!bankCode || !accountNumber))}
            data-testid="button-confirm-transaction"
          >
            {isWithdrawing ? <Loader2 className="animate-spin" /> : "Confirm Withdrawal"}
          </Button>
        </form>
      );
    }

    if (depositStep === "method") {
      return (
        <div className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">Choose how you want to deposit funds into your wallet</p>

          <button
            onClick={() => { setDepositMethod("card"); setDepositStep("details"); }}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover-elevate transition-colors text-left"
            data-testid="button-method-card"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <CreditCard className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Debit/Credit Card</p>
              <p className="text-sm text-muted-foreground">Pay with your Visa, Mastercard or Verve card</p>
            </div>
          </button>

          <button
            onClick={() => { setDepositMethod("bank_account"); setDepositStep("details"); }}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover-elevate transition-colors text-left"
            data-testid="button-method-bank-account"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Landmark className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Bank Account</p>
              <p className="text-sm text-muted-foreground">Pay directly from your bank account</p>
            </div>
          </button>

          <button
            onClick={() => { setDepositMethod("bank_transfer"); setDepositStep("details"); }}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover-elevate transition-colors text-left"
            data-testid="button-method-bank-transfer"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Bank Transfer</p>
              <p className="text-sm text-muted-foreground">Manual bank transfer deposit</p>
            </div>
          </button>
        </div>
      );
    }

    if (depositStep === "otp") {
      return (
        <div className="space-y-6 mt-4">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <h3 className="font-semibold text-lg text-foreground" data-testid="text-otp-title">Enter OTP</h3>
            <p className="text-sm text-muted-foreground mt-1">
              A 6-digit verification code has been sent to your registered phone/email for {otpMaskedInfo}
            </p>
          </div>

          <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
            {otpValue.map((digit, index) => (
              <Input
                key={index}
                ref={(el) => { otpInputRefs.current[index] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(index, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(index, e)}
                className="w-12 h-14 text-center text-xl font-bold rounded-xl"
                data-testid={`input-otp-${index}`}
              />
            ))}
          </div>

          <div className="space-y-3">
            <Button
              onClick={handleOtpVerify}
              className="w-full rounded-xl font-bold"
              disabled={isVerifying || otpValue.join("").length !== 6}
              data-testid="button-verify-otp"
            >
              {isVerifying ? <Loader2 className="animate-spin" /> : "Verify & Complete Deposit"}
            </Button>

            <div className="flex items-center justify-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => resendOtp({ sessionId: otpSessionId })}
                disabled={isResending}
                data-testid="button-resend-otp"
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                {isResending ? "Sending..." : "Resend OTP"}
              </Button>
            </div>

            <Button
              variant="outline"
              className="w-full rounded-xl"
              onClick={() => { setDepositStep("details"); setOtpValue(["", "", "", "", "", ""]); }}
              data-testid="button-back-from-otp"
            >
              Go Back
            </Button>
          </div>
        </div>
      );
    }

    if (depositStep === "success") {
      return (
        <div className="text-center py-8 space-y-4">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-10 h-10 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="font-bold text-xl text-foreground" data-testid="text-deposit-success">Deposit Successful!</h3>
          <p className="text-muted-foreground">N{Number(amount).toLocaleString()} has been added to your wallet</p>
        </div>
      );
    }

    if (depositMethod === "bank_transfer") {
      return (
        <form onSubmit={handleBankTransferSubmit} className="space-y-4 mt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDepositStep("method")}
            className="mb-2"
            data-testid="button-back-to-methods"
          >
            Back to payment methods
          </Button>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Select Bank
            </label>
            <Select value={bankCode} onValueChange={setBankCode}>
              <SelectTrigger className="rounded-xl" data-testid="select-bank-deposit">
                <SelectValue placeholder="Choose your bank" />
              </SelectTrigger>
              <SelectContent>
                {NIGERIAN_BANKS.map((bank) => (
                  <SelectItem key={bank.code} value={bank.code} data-testid={`select-deposit-bank-option-${bank.code}`}>
                    {bank.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Account Number</label>
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              placeholder="Enter 10-digit account number"
              value={accountNumber}
              onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ''))}
              className="rounded-xl"
              data-testid="input-deposit-account-number"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Account Name (optional)</label>
            <Input
              type="text"
              placeholder="e.g. John Doe"
              value={accountName}
              onChange={e => setAccountName(e.target.value)}
              className="rounded-xl"
              data-testid="input-deposit-account-name"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Amount (N)</label>
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="rounded-xl text-lg"
              data-testid="input-deposit-amount"
            />
          </div>

          {bankCode && accountNumber && amount && (
            <Card className="bg-muted/50 border-dashed">
              <CardContent className="p-4 space-y-1 text-sm">
                <p className="font-semibold text-foreground" data-testid="text-deposit-summary-title">Deposit Summary</p>
                <div className="flex justify-between gap-2 flex-wrap">
                  <span className="text-muted-foreground">Bank</span>
                  <span className="font-medium text-foreground">{selectedBank?.name}</span>
                </div>
                <div className="flex justify-between gap-2 flex-wrap">
                  <span className="text-muted-foreground">Account</span>
                  <span className="font-medium text-foreground">{accountNumber}</span>
                </div>
                <div className="flex justify-between gap-2 flex-wrap">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-bold text-primary">N{Number(amount).toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          )}

          <Button
            type="submit"
            className="w-full rounded-xl font-bold bg-primary text-white"
            disabled={isDepositing || !bankCode || !accountNumber || !amount}
            data-testid="button-confirm-bank-deposit"
          >
            {isDepositing ? <Loader2 className="animate-spin" /> : "Confirm Deposit"}
          </Button>
        </form>
      );
    }

    if (depositMethod === "card") {
      return (
        <div className="space-y-4 mt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDepositStep("method")}
            className="mb-2"
            data-testid="button-back-to-methods-card"
          >
            Back to payment methods
          </Button>

          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">Card Details</span>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Card Number</label>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="0000 0000 0000 0000"
              value={cardNumber}
              onChange={e => setCardNumber(formatCardNumber(e.target.value))}
              maxLength={19}
              className="rounded-xl text-lg tracking-wider"
              data-testid="input-card-number"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Expiry Date</label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="MM/YY"
                value={cardExpiry}
                onChange={e => setCardExpiry(formatExpiry(e.target.value))}
                maxLength={5}
                className="rounded-xl"
                data-testid="input-card-expiry"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">CVV</label>
              <Input
                type="password"
                inputMode="numeric"
                placeholder="***"
                value={cardCvv}
                onChange={e => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                maxLength={4}
                className="rounded-xl"
                data-testid="input-card-cvv"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Amount (N)</label>
            <Input
              type="number"
              placeholder="Min. 100"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="rounded-xl text-lg"
              data-testid="input-card-amount"
            />
          </div>

          {cardNumber && cardExpiry && cardCvv && amount && (
            <Card className="bg-muted/50 border-dashed">
              <CardContent className="p-4 space-y-1 text-sm">
                <p className="font-semibold text-foreground">Payment Summary</p>
                <div className="flex justify-between gap-2 flex-wrap">
                  <span className="text-muted-foreground">Card</span>
                  <span className="font-medium text-foreground">****{cardNumber.replace(/\s/g, '').slice(-4)}</span>
                </div>
                <div className="flex justify-between gap-2 flex-wrap">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-bold text-primary">N{Number(amount).toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          )}

          <Button
            onClick={handleCardDepositInitiate}
            className="w-full rounded-xl font-bold"
            disabled={isInitiating || !cardNumber || !cardExpiry || !cardCvv || !amount || Number(amount) < 100}
            data-testid="button-pay-with-card"
          >
            {isInitiating ? <Loader2 className="animate-spin" /> : `Pay N${Number(amount || 0).toLocaleString()}`}
          </Button>

          <p className="text-xs text-muted-foreground text-center">You will receive an OTP to verify this transaction</p>
        </div>
      );
    }

    if (depositMethod === "bank_account") {
      return (
        <div className="space-y-4 mt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDepositStep("method")}
            className="mb-2"
            data-testid="button-back-to-methods-bank"
          >
            Back to payment methods
          </Button>

          <div className="flex items-center gap-2 mb-2">
            <Landmark className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">Bank Account Details</span>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Select Bank</label>
            <Select value={bankCode} onValueChange={setBankCode}>
              <SelectTrigger className="rounded-xl" data-testid="select-bank-account">
                <SelectValue placeholder="Choose your bank" />
              </SelectTrigger>
              <SelectContent>
                {NIGERIAN_BANKS.map((bank) => (
                  <SelectItem key={bank.code} value={bank.code}>
                    {bank.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Account Number</label>
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              placeholder="Enter 10-digit account number"
              value={accountNumber}
              onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ''))}
              className="rounded-xl"
              data-testid="input-bank-account-number"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Amount (N)</label>
            <Input
              type="number"
              placeholder="Min. 100"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="rounded-xl text-lg"
              data-testid="input-bank-account-amount"
            />
          </div>

          {bankCode && accountNumber && amount && (
            <Card className="bg-muted/50 border-dashed">
              <CardContent className="p-4 space-y-1 text-sm">
                <p className="font-semibold text-foreground">Payment Summary</p>
                <div className="flex justify-between gap-2 flex-wrap">
                  <span className="text-muted-foreground">Bank</span>
                  <span className="font-medium text-foreground">{selectedBank?.name}</span>
                </div>
                <div className="flex justify-between gap-2 flex-wrap">
                  <span className="text-muted-foreground">Account</span>
                  <span className="font-medium text-foreground">****{accountNumber.slice(-4)}</span>
                </div>
                <div className="flex justify-between gap-2 flex-wrap">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-bold text-primary">N{Number(amount).toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          )}

          <Button
            onClick={handleCardDepositInitiate}
            className="w-full rounded-xl font-bold"
            disabled={isInitiating || !bankCode || !accountNumber || !amount || Number(amount) < 100}
            data-testid="button-pay-with-bank"
          >
            {isInitiating ? <Loader2 className="animate-spin" /> : `Pay N${Number(amount || 0).toLocaleString()}`}
          </Button>

          <p className="text-xs text-muted-foreground text-center">You will receive an OTP to verify this transaction</p>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-display font-bold text-foreground mb-8" data-testid="text-wallet-title">My Wallet</h1>

        <div className="grid gap-8 md:grid-cols-2">
          <div className="bg-primary rounded-3xl p-8 text-white shadow-2xl shadow-primary/30 relative overflow-hidden md:col-span-2">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <WalletIcon className="w-32 h-32" />
            </div>

            <p className="text-primary-foreground/80 font-medium mb-2">Available Balance</p>
            <h2 className="text-5xl font-bold font-display tracking-tight mb-8" data-testid="text-wallet-balance">
              N{Number(wallet?.balance || 0).toLocaleString()}
            </h2>

            <div className="flex gap-4 relative z-10">
              <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button
                    onClick={() => { setAction("deposit"); setDepositStep("method"); }}
                    className="bg-white text-primary font-bold px-6 rounded-xl border-2 border-transparent"
                    data-testid="button-open-deposit"
                  >
                    <Plus className="mr-2 h-5 w-5" /> Deposit Funds
                  </Button>
                </DialogTrigger>
                <DialogTrigger asChild>
                  <Button
                    onClick={() => { setAction("withdraw"); }}
                    className="bg-primary-foreground/10 text-white font-bold px-6 rounded-xl backdrop-blur-sm border-2 border-white/20"
                    data-testid="button-open-withdraw"
                  >
                    Withdraw
                  </Button>
                </DialogTrigger>

                <DialogContent className="rounded-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle data-testid="text-dialog-title">
                      {action === "withdraw"
                        ? "Withdraw to Bank"
                        : depositStep === "method"
                        ? "Choose Deposit Method"
                        : depositStep === "otp"
                        ? "Verify Payment"
                        : depositStep === "success"
                        ? "Payment Complete"
                        : depositMethod === "card"
                        ? "Pay with Card"
                        : depositMethod === "bank_account"
                        ? "Pay with Bank Account"
                        : "Bank Transfer Deposit"
                      }
                    </DialogTitle>
                  </DialogHeader>
                  {renderDepositContent()}
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <Card className="md:col-span-2 rounded-3xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="font-display">Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              {wallet?.transactions.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground" data-testid="text-no-transactions">No transactions yet.</div>
              ) : (
                <div className="space-y-4">
                  {wallet?.transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between gap-4 p-4 rounded-xl bg-muted/20 transition-colors" data-testid={`row-transaction-${tx.id}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          ['deposit', 'job_earning'].includes(tx.type) ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                        }`}>
                          {['deposit', 'job_earning'].includes(tx.type) ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="font-bold capitalize text-foreground">{tx.type.replace('_', ' ')}</p>
                          {(tx as any).bankName && (
                            <p className="text-xs text-muted-foreground">{(tx as any).bankName}</p>
                          )}
                          <p className="text-xs text-muted-foreground">{format(new Date(tx.createdAt || Date.now()), "PP p")}</p>
                        </div>
                      </div>
                      <span className={`font-bold font-mono flex-shrink-0 ${
                        ['deposit', 'job_earning'].includes(tx.type) ? "text-green-600 dark:text-green-400" : "text-foreground"
                      }`}>
                        {['deposit', 'job_earning'].includes(tx.type) ? "+" : "-"}N{Math.abs(Number(tx.amount)).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
