import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    MenuItem,
    Divider,
    Typography,
    Box,
    Chip,
    List,
    ListItem,
    ListItemText,
} from "@mui/material";

import { useEffect, useState } from "react";

import toast from "react-hot-toast";

import {
    getRoles,
    inviteMember,
    getNGOInvitations,
} from "../../../apis/ngo/applyNGO";

import type {
    NGORole,
} from "../types/ngo";

interface NGOInvitation {
    id: string;

    status:
        | "PENDING"
        | "ACCEPTED"
        | "REJECTED";

    createdAt: string;

    user: {
        id: string;
        email: string;
    };

    role: {
        id: string;
        name: string;
    };
}

interface Props {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    ngoId: string;
}

const InviteMemberDialog = ({
    open,
    onClose,
    onSuccess,
    ngoId,
}: Props) => {

    const [email, setEmail] =
        useState("");

    const [roleId, setRoleId] =
        useState("");

    const [roles, setRoles] =
        useState<NGORole[]>([]);

    const [invitations,
        setInvitations] =
        useState<NGOInvitation[]>([]);

    const [loadingInvitations,
        setLoadingInvitations] =
        useState(false);

    const loadRoles = async () => {
        try {

            const data =
                await getRoles();

            setRoles(data);

        } catch {

            toast.error(
                "Failed to load roles"
            );
        }
    };

    const loadInvitations =
        async () => {

            try {

                setLoadingInvitations(
                    true
                );

                const data =
                    await getNGOInvitations(
                        ngoId
                    );

                setInvitations(
                    data
                );

            } catch {

                toast.error(
                    "Failed to load invitations"
                );

            } finally {

                setLoadingInvitations(
                    false
                );
            }
        };

    useEffect(() => {

        if (open) {

            loadRoles();

            loadInvitations();
        }

    }, [open]);

    const handleInvite =
        async () => {

            try {

                await inviteMember({
                    email,
                    roleId,
                });

                toast.success(
                    "Invitation sent"
                );

                setEmail("");

                setRoleId("");

                await loadInvitations();

                onSuccess();

            } catch (error: any) {

                toast.error(
                    error.message ||
                    "Failed to invite"
                );
            }
        };

    const getStatusColor =
        (
            status: string
        ) => {

            switch (status) {

                case "ACCEPTED":
                    return "success";

                case "REJECTED":
                    return "error";

                default:
                    return "warning";
            }
        };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="sm"
        >
            <DialogTitle>
                Invite Member
            </DialogTitle>

            <DialogContent>

                <TextField
                    fullWidth
                    margin="normal"
                    label="Email"
                    value={email}
                    onChange={(e) =>
                        setEmail(
                            e.target.value
                        )
                    }
                />

                <TextField
                    select
                    fullWidth
                    margin="normal"
                    label="Role"
                    value={roleId}
                    onChange={(e) =>
                        setRoleId(
                            e.target.value
                        )
                    }
                >
                    {roles.map(
                        (role) => (
                            <MenuItem
                                key={role.id}
                                value={role.id}
                            >
                                {role.name}
                            </MenuItem>
                        )
                    )}
                </TextField>

                <Divider
                    sx={{ my: 3 }}
                />

                <Typography
                    variant="subtitle1"
                    fontWeight={600}
                    gutterBottom
                >
                    Sent Invitations
                </Typography>

                <Box
                    sx={{
                        border:
                            "1px solid",
                        borderColor:
                            "divider",
                        borderRadius: 1,
                        maxHeight: 250,
                        overflowY:
                            "auto",
                    }}
                >

                    {loadingInvitations ? (

                        <Typography
                            sx={{
                                p: 2,
                            }}
                        >
                            Loading...
                        </Typography>

                    ) : invitations.length === 0 ? (

                        <Typography
                            sx={{
                                p: 2,
                            }}
                        >
                            No invitations sent yet.
                        </Typography>

                    ) : (

                        <List>

                            {invitations.map(
                                (
                                    invitation
                                ) => (

                                    <ListItem
                                        key={
                                            invitation.id
                                        }
                                        divider
                                    >

                                        <ListItemText
                                            primary={
                                                invitation
                                                    .user
                                                    .email
                                            }
                                            secondary={
                                                <>
                                                    Role:{" "}
                                                    {
                                                        invitation
                                                            .role
                                                            .name
                                                    }

                                                    <br />

                                                    Invited:{" "}
                                                    {
                                                        new Date(
                                                            invitation.createdAt
                                                        ).toLocaleDateString()
                                                    }
                                                </>
                                            }
                                        />

                                        <Chip
                                            label={
                                                invitation.status
                                            }
                                            color={
                                                getStatusColor(
                                                    invitation.status
                                                ) as any
                                            }
                                            size="small"
                                        />

                                    </ListItem>
                                )
                            )}

                        </List>
                    )}

                </Box>

            </DialogContent>

            <DialogActions>

                <Button
                    onClick={onClose}
                >
                    Cancel
                </Button>

                <Button
                    variant="contained"
                    onClick={
                        handleInvite
                    }
                >
                    Invite
                </Button>

            </DialogActions>

        </Dialog>
    );
};

export default InviteMemberDialog;