package io.github.konja9.pachifuto;

import android.content.Context;
import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.SnapshotsClient;
import com.google.android.gms.games.snapshot.Snapshot;
import com.google.android.gms.games.snapshot.SnapshotMetadataChange;
import java.nio.charset.StandardCharsets;

/**
 * Google Play Games Services（v2）の、このゲームで使うところだけの Capacitor プラグイン。
 * JS からは src/ui/games.ts の registerPlugin('PlayGames') で呼ぶ。
 * ログインは起動時に自動で行われる（v2 の仕様）。res/values/games-ids.xml の ID が仮の 0 の間は何もしない
 */
@CapacitorPlugin(name = "PlayGames")
public class PlayGamesPlugin extends Plugin {

    private static final int RC_UI = 9201;

    /** Play Console で発行した ID が入っているか（仮の 0 のままなら使わない） */
    static boolean configured(Context ctx) {
        String id = ctx.getString(R.string.game_services_project_id).trim();
        return !id.isEmpty() && !id.equals("0");
    }

    private boolean ready(PluginCall call) {
        if (configured(getContext())) return true;
        call.reject("not-configured");
        return false;
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject r = new JSObject();
        r.put("available", configured(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void isAuthenticated(PluginCall call) {
        if (!ready(call)) return;
        PlayGames.getGamesSignInClient(getActivity()).isAuthenticated().addOnCompleteListener(task -> {
            JSObject r = new JSObject();
            r.put("authenticated", task.isSuccessful() && task.getResult().isAuthenticated());
            call.resolve(r);
        });
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        if (!ready(call)) return;
        PlayGames.getGamesSignInClient(getActivity()).signIn().addOnCompleteListener(task -> {
            JSObject r = new JSObject();
            r.put("authenticated", task.isSuccessful() && task.getResult().isAuthenticated());
            call.resolve(r);
        });
    }

    @PluginMethod
    public void unlock(PluginCall call) {
        if (!ready(call)) return;
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("no-id");
            return;
        }
        PlayGames.getAchievementsClient(getActivity()).unlock(id);
        call.resolve();
    }

    @PluginMethod
    public void submitScore(PluginCall call) {
        if (!ready(call)) return;
        String id = call.getString("id");
        Double score = call.getDouble("score");
        if (id == null || id.isEmpty() || score == null) {
            call.reject("bad-args");
            return;
        }
        PlayGames.getLeaderboardsClient(getActivity()).submitScore(id, score.longValue());
        call.resolve();
    }

    @PluginMethod
    public void showAchievements(PluginCall call) {
        if (!ready(call)) return;
        PlayGames.getAchievementsClient(getActivity())
            .getAchievementsIntent()
            .addOnSuccessListener(intent -> {
                getActivity().startActivityForResult(intent, RC_UI);
                call.resolve();
            })
            .addOnFailureListener(e -> call.reject(e.getMessage()));
    }

    @PluginMethod
    public void showLeaderboard(PluginCall call) {
        if (!ready(call)) return;
        String id = call.getString("id");
        com.google.android.gms.tasks.Task<Intent> t = id == null || id.isEmpty()
            ? PlayGames.getLeaderboardsClient(getActivity()).getAllLeaderboardsIntent()
            : PlayGames.getLeaderboardsClient(getActivity()).getLeaderboardIntent(id);
        t.addOnSuccessListener(intent -> {
            getActivity().startActivityForResult(intent, RC_UI);
            call.resolve();
        }).addOnFailureListener(e -> call.reject(e.getMessage()));
    }

    /** クラウドセーブに書く（衝突したら Google 側で、最後に変えた方を残す） */
    @PluginMethod
    public void saveSnapshot(PluginCall call) {
        if (!ready(call)) return;
        String name = call.getString("name", "main");
        String data = call.getString("data", "");
        String description = call.getString("description", "");
        Double progress = call.getDouble("progress", 0.0);
        SnapshotsClient client = PlayGames.getSnapshotsClient(getActivity());
        client.open(name, true, SnapshotsClient.RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED).addOnCompleteListener(task -> {
            if (!task.isSuccessful() || task.getResult().isConflict()) {
                call.reject(task.getException() != null ? task.getException().getMessage() : "conflict");
                return;
            }
            Snapshot snap = task.getResult().getData();
            snap.getSnapshotContents().writeBytes(data.getBytes(StandardCharsets.UTF_8));
            SnapshotMetadataChange change = new SnapshotMetadataChange.Builder()
                .setDescription(description)
                .setProgressValue(progress.longValue())
                .build();
            client.commitAndClose(snap, change).addOnCompleteListener(done -> {
                if (done.isSuccessful()) call.resolve();
                else call.reject(done.getException() != null ? done.getException().getMessage() : "commit-failed");
            });
        });
    }

    /** クラウドセーブを読む（まだなければ found: false） */
    @PluginMethod
    public void loadSnapshot(PluginCall call) {
        if (!ready(call)) return;
        String name = call.getString("name", "main");
        SnapshotsClient client = PlayGames.getSnapshotsClient(getActivity());
        client.open(name, false, SnapshotsClient.RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED).addOnCompleteListener(task -> {
            JSObject r = new JSObject();
            if (!task.isSuccessful() || task.getResult().isConflict()) {
                // 見つからない（初めて）も、ここに来る
                r.put("found", false);
                call.resolve(r);
                return;
            }
            Snapshot snap = task.getResult().getData();
            try {
                byte[] bytes = snap.getSnapshotContents().readFully();
                r.put("found", true);
                r.put("data", new String(bytes, StandardCharsets.UTF_8));
                r.put("modified", snap.getMetadata().getLastModifiedTimestamp());
                call.resolve(r);
            } catch (Exception e) {
                call.reject(e.getMessage());
            } finally {
                client.discardAndClose(snap);
            }
        });
    }
}
