/*
 * fdwrite — fast, no-Full-Disk-Access SD writer for the OpenNova Installer (macOS).
 *
 * This is the same technique Raspberry Pi Imager uses. macOS will not let even
 * root open /dev/rdiskN of a removable disk without Full Disk Access OR an
 * Apple-entitled opener. `authopen` is that entitled opener, but `authopen -w`
 * copies stdin to the disk in a tiny ~8 KB loop (slow). So instead we ask
 * authopen to just OPEN the disk and hand the file descriptor back to us over a
 * socket (`-stdoutpipe`), then WE write large blocks to that fd ourselves —
 * fast, and still no Full Disk Access (authopen's entitlement granted the open).
 *
 * Usage:  fdwrite <image-path> <device>      e.g.  fdwrite /tmp/x.img /dev/rdisk4
 * Output: cumulative bytes written, one integer per line on stdout (for the
 *         parent process's progress bar). Errors go to stderr; exit non-zero.
 *
 * The disk fd is privileged but this process runs as the normal user, so the
 * parent can simply kill it to cancel.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <sys/wait.h>
#include <sys/uio.h>

/* Receive a single file descriptor sent via SCM_RIGHTS on socket `s`. */
static int recv_fd(int s) {
    struct msghdr msg;
    memset(&msg, 0, sizeof(msg));

    char dummy[1];
    struct iovec iov;
    iov.iov_base = dummy;
    iov.iov_len = sizeof(dummy);
    msg.msg_iov = &iov;
    msg.msg_iovlen = 1;

    union {
        struct cmsghdr cm;
        char control[CMSG_SPACE(sizeof(int))];
    } ctrl;
    memset(&ctrl, 0, sizeof(ctrl));
    msg.msg_control = ctrl.control;
    msg.msg_controllen = sizeof(ctrl.control);

    ssize_t n = recvmsg(s, &msg, 0);
    if (n <= 0) {
        return -1; /* peer closed without sending a fd (e.g. auth denied) */
    }
    struct cmsghdr *c = CMSG_FIRSTHDR(&msg);
    if (!c || c->cmsg_len != CMSG_LEN(sizeof(int)) ||
        c->cmsg_level != SOL_SOCKET || c->cmsg_type != SCM_RIGHTS) {
        return -1;
    }
    int fd;
    memcpy(&fd, CMSG_DATA(c), sizeof(int));
    return fd;
}

int main(int argc, char **argv) {
    if (argc != 3) {
        fprintf(stderr, "usage: fdwrite <image-path> <device>\n");
        return 2;
    }
    const char *image = argv[1];
    const char *device = argv[2];

    int sp[2];
    if (socketpair(AF_UNIX, SOCK_STREAM, 0, sp) != 0) {
        fprintf(stderr, "socketpair: %s\n", strerror(errno));
        return 1;
    }

    pid_t pid = fork();
    if (pid < 0) {
        fprintf(stderr, "fork: %s\n", strerror(errno));
        return 1;
    }
    if (pid == 0) {
        /* child: authopen, with its stdout = our socket end. */
        close(sp[0]);
        if (dup2(sp[1], STDOUT_FILENO) < 0) {
            _exit(127);
        }
        close(sp[1]);
        execl("/usr/libexec/authopen", "authopen", "-stdoutpipe", "-w", device, (char *)NULL);
        _exit(127); /* execl only returns on failure */
    }

    /* parent: receive the privileged disk fd, then reap authopen. */
    close(sp[1]);
    int disk = recv_fd(sp[0]);
    close(sp[0]);
    int status = 0;
    waitpid(pid, &status, 0);

    if (disk < 0) {
        fprintf(stderr, "could not obtain disk descriptor (authorization denied or authopen failed)\n");
        return 1;
    }

    int img = open(image, O_RDONLY);
    if (img < 0) {
        fprintf(stderr, "open image: %s\n", strerror(errno));
        return 1;
    }

    const size_t BS = 1024 * 1024; /* 1 MiB blocks: fast on raw disks, safe single writes */
    char *buf = malloc(BS);
    if (!buf) {
        fprintf(stderr, "out of memory\n");
        return 1;
    }

    unsigned long long total = 0;
    unsigned long blocks = 0;
    for (;;) {
        ssize_t r = read(img, buf, BS);
        if (r < 0) {
            if (errno == EINTR) continue;
            fprintf(stderr, "read image: %s\n", strerror(errno));
            free(buf);
            return 1;
        }
        if (r == 0) break;

        /* Raw devices need whole-block (512-multiple) writes; a Pi image is a
         * whole number of sectors and BS is a 512-multiple, so the final short
         * read is still aligned. Expect the write to consume the whole buffer. */
        ssize_t w;
        do {
            w = write(disk, buf, (size_t)r);
        } while (w < 0 && errno == EINTR);
        if (w != r) {
            fprintf(stderr, "write disk: %s\n", w < 0 ? strerror(errno) : "short write");
            free(buf);
            return 1;
        }

        total += (unsigned long long)r;
        if (++blocks % 8 == 0) { /* report roughly every 8 MiB */
            printf("%llu\n", total);
            fflush(stdout);
        }
    }

    if (fsync(disk) != 0 && errno != ENOTSUP && errno != EINVAL) {
        fprintf(stderr, "fsync: %s\n", strerror(errno));
        free(buf);
        return 1;
    }
    free(buf);
    close(img);
    close(disk);
    printf("%llu\n", total);
    fflush(stdout);
    return 0;
}
