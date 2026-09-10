import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:percent_indicator/circular_percent_indicator.dart';

class AttendanceScreen extends StatefulWidget {
  final String institutionId;

  const AttendanceScreen({super.key, required this.institutionId});

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  int presentDays = 0;
  int totalDays = 0;
  double percentage = 0;
  bool loading = true;

  String? studentClass;
  String? studentSection;

  @override
  void initState() {
    super.initState();
    fetchAttendance();
  }

  Future<void> fetchAttendance() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    try {
      /// 🔹 STEP 1: Get student data
      final userDoc = await FirebaseFirestore.instance
          .collection('institutions')
          .doc(widget.institutionId)
          .collection('users')
          .doc(user.uid)
          .get();

      final data = userDoc.data();

      studentClass = data?['class'];
      studentSection = data?['section'];

      /// 🔹 STEP 2: Fetch attendance
      final snapshot = await FirebaseFirestore.instance
          .collection('attendance_v2')
          .where('institutionId', isEqualTo: widget.institutionId)
          .where('class', isEqualTo: studentClass)
          .where('section', isEqualTo: studentSection)
          .get();

      int present = 0;
      int total = 0;

      for (var doc in snapshot.docs) {
        final docData = doc.data();
        final students = docData['students'] as Map<String, dynamic>;

        if (students.containsKey(user.uid)) {
          total++;
          if (students[user.uid] == true) {
            present++;
          }
        }
      }

      setState(() {
        presentDays = present;
        totalDays = total;
        percentage = total == 0 ? 0 : (present / total) * 100;
        loading = false;
      });
    } catch (e) {
      print("Error: $e");
      setState(() {
        loading = false;
      });
    }
  }

  Color getProgressColor() {
    if (percentage >= 75) return Colors.green;
    if (percentage >= 50) return Colors.orange;
    return Colors.red;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Attendance"),
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [

            /// 🔥 TITLE
            const Align(
              alignment: Alignment.centerLeft,
              child: Text(
                "Your Attendance",
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),

            const SizedBox(height: 20),

            /// 🔵 CIRCULAR PROGRESS
            CircularPercentIndicator(
              radius: 100.0,
              lineWidth: 14.0,
              percent: totalDays == 0 ? 0 : (percentage / 100),
              animation: true,
              circularStrokeCap: CircularStrokeCap.round,
              progressColor: getProgressColor(),
              backgroundColor: Colors.grey.shade200,
              center: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    "${percentage.toStringAsFixed(1)}%",
                    style: const TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    "$presentDays / $totalDays days",
                    style: const TextStyle(fontSize: 12),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 30),

            /// 🔹 SUMMARY CARDS
            Row(
              children: [
                infoCard("Present", presentDays, Colors.green),
                infoCard("Total", totalDays, Colors.blue),
                infoCard(
                    "Absent", totalDays - presentDays, Colors.red),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// 🔹 MODERN CARD
  Widget infoCard(String title, int value, Color color) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 6),
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 10,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Column(
          children: [
            Text(
              value.toString(),
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              title,
              style: const TextStyle(fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }
}