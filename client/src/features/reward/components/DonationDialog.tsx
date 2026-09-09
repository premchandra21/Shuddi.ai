import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Button,
  TextField,
  Stack,
  Chip,
} from '@mui/material';

type DonationDialogProps = {
  open: boolean;
  foundationName: string;
  amount: number;
  loading?: boolean;
  onAmountChange: (amount: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

const PRESET_AMOUNTS = [100, 250, 500];

export const DonationDialog: React.FC<DonationDialogProps> = ({
  open,
  foundationName,
  amount,
  loading = false,
  onAmountChange,
  onCancel,
  onConfirm,
}) => {
  return (
    <Dialog open={open} onClose={loading ? undefined : onCancel} maxWidth="xs" fullWidth>
      <DialogTitle fontWeight={600}>
        Donate to {foundationName}
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Your donation will be securely processed via Razorpay.
        </Typography>

        {/* Preset Amounts */}
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
          {PRESET_AMOUNTS.map((value) => (
            <Chip
              key={value}
              label={`₹${value}`}
              clickable={!loading}
              color={amount === value ? 'primary' : 'default'}
              onClick={() => onAmountChange(value)}
            />
          ))}
        </Stack>

        {/* Custom Amount */}
        <TextField
          label="Custom Amount (₹)"
          type="number"
          fullWidth
          value={amount || ''}
          onChange={(e) => onAmountChange(Number(e.target.value))}
          disabled={loading}
          inputProps={{ min: 1 }}
        />

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 1, display: 'block' }}
        >
          Minimum donation amount is ₹1.
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          disabled={loading || amount <= 0}
        >
          {loading ? 'Processing…' : 'Confirm & Donate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
