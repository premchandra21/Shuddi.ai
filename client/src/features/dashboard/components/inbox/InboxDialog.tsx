// src/components/inbox/InboxDialog.tsx

import {
    Dialog,
    DialogTitle,
    DialogContent,
    Typography,
    List,
    ListItemButton,
    Divider,
    Box,
    CircularProgress,
} from "@mui/material";

import {
    useEffect,
    useState,
} from "react";

import toast from "react-hot-toast";

import {
    getMyInvitations,
} from "../../../../apis/dashboard/inbox.api";

import type {
    Invitation,
} from "./types";

import InvitationDetailDialog
    from "./InvitationDetailDialog";

interface Props {
    open: boolean;
    onClose: () => void;
}

const InboxDialog = ({
    open,
    onClose,
}: Props) => {

    const [
        invitations,
        setInvitations,
    ] = useState<
        Invitation[]
    >([]);

    const [
        loading,
        setLoading,
    ] = useState(false);

    const [
        selectedInvitation,
        setSelectedInvitation,
    ] =
        useState<
            Invitation | null
        >(null);

    const loadInvitations =
        async () => {

            try {

                setLoading(true);

                const data =
                    await getMyInvitations();

                setInvitations(
                    data
                );

            } catch {

                toast.error(
                    "Failed to load inbox"
                );

            } finally {

                setLoading(false);
            }
        };

    useEffect(() => {

        if (open) {

            loadInvitations();
        }

    }, [open]);

    const handleActionComplete =
        async () => {

            setSelectedInvitation(
                null
            );

            await loadInvitations();
        };

    return (
        <>
            <Dialog
                open={open}
                onClose={onClose}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>
                    Inbox
                </DialogTitle>

                <DialogContent>

                    {loading ? (

                        <Box
                            display="flex"
                            justifyContent="center"
                            py={4}
                        >
                            <CircularProgress />
                        </Box>

                    ) : invitations.length === 0 ? (

                        <Typography>
                            No messages.
                        </Typography>

                    ) : (

                        <List>

                            {invitations.map(
                                (
                                    invitation
                                ) => (
                                    <Box
                                        key={
                                            invitation.id
                                        }
                                    >
                                        <ListItemButton
                                            onClick={() =>
                                                setSelectedInvitation(
                                                    invitation
                                                )
                                            }
                                        >

                                            <Box>

                                                <Typography
                                                    fontWeight={600}
                                                >
                                                    NGO Invitation
                                                </Typography>

                                                <Typography
                                                    variant="body2"
                                                >
                                                    You've been invited to
                                                    join{" "}
                                                    <strong>
                                                        {
                                                            invitation.ngo.name
                                                        }
                                                    </strong>
                                                </Typography>

                                                <Typography
                                                    variant="caption"
                                                    color="text.secondary"
                                                >
                                                    Role offered:{" "}
                                                    {
                                                        invitation.role.name
                                                    }
                                                </Typography>

                                            </Box>

                                        </ListItemButton>

                                        <Divider />
                                    </Box>
                                )
                            )}

                        </List>
                    )}

                </DialogContent>
            </Dialog>

            <InvitationDetailDialog
                open={
                    !!selectedInvitation
                }
                invitation={
                    selectedInvitation
                }
                onClose={() =>
                    setSelectedInvitation(
                        null
                    )
                }
                onActionComplete={
                    handleActionComplete
                }
            />
        </>
    );
};

export default InboxDialog;